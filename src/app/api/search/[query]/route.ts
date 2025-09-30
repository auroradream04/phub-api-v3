import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ query: string }> }
) {
  try {
    const { query } = await params

    if (!query || query.trim() === '') {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      )
    }

    // Decode the query parameter
    const decodedQuery = decodeURIComponent(query)

    // Parse search options from query parameters
    const searchParams = request.nextUrl.searchParams
    const options: any = {}

    // Page number
    const page = searchParams.get('page')
    if (page) {
      options.page = parseInt(page, 10)
      if (isNaN(options.page) || options.page < 1) {
        options.page = 1
      }
    } else {
      options.page = 1
    }

    // Additional search options
    const order = searchParams.get('order')
    if (order) options.order = order

    const segments = searchParams.get('segments')
    if (segments) options.segments = segments

    const period = searchParams.get('period')
    if (period) options.period = period

    console.log(`[Search] Query: "${decodedQuery}", Options:`, options)

    // Initialize PornHub client
    const pornhub = new PornHub()

    let videoList
    let retries = 3

    // Try without proxy first (saves proxy bandwidth)
    try {
      videoList = await pornhub.searchVideo(decodedQuery, options)
      console.log(`[Search] Success without proxy, found ${videoList?.data?.length || 0} results`)
    } catch (error) {
      console.error('[Search] Request failed without proxy:', error instanceof Error ? error.message : 'Unknown error')
    }

    // Retry with random proxies if initial request failed
    while ((videoList === undefined || videoList === null || !videoList.data || videoList.data.length < 1) && retries > 0) {
      const proxyAgent = getRandomProxy()

      if (!proxyAgent) {
        console.warn('[Search] No proxies available. Cannot retry.')
        break
      }

      console.log(`[Search] Retrying with proxy (${retries} retries remaining)...`)
      pornhub.setAgent(proxyAgent)

      try {
        videoList = await pornhub.searchVideo(decodedQuery, options)
        console.log(`[Search] Success with proxy, found ${videoList?.data?.length || 0} results`)
      } catch (error) {
        console.error('[Search] Request failed with proxy:', error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
    }

    // Check if we got valid results
    if (!videoList || !videoList.data || videoList.data.length < 1) {
      console.error('[Search] No results found after all retries')
      return NextResponse.json(
        { error: 'No results found or unable to fetch search results' },
        { status: 404 }
      )
    }

    // Get base URL for transforming video URLs
    const protocol = request.headers.get('x-forwarded-proto') || 'http'
    const host = request.headers.get('host') || 'localhost:4444'
    const baseUrl = `${protocol}://${host}`

    // Transform video URLs to use our API
    const transformedVideoList = {
      ...videoList,
      data: videoList.data.map((video: any) => ({
        ...video,
        // Keep original URL for reference
        originalUrl: video.url,
        // Transform to use our watch endpoint
        url: video.key ? `${baseUrl}/api/watch/${video.key}` : video.url,
      }))
    }

    console.log(`[Search] Returning ${transformedVideoList.data.length} results for "${decodedQuery}"`)

    // Return search results
    return NextResponse.json(transformedVideoList, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200', // Cache for 1 hour
      }
    })

  } catch (error) {
    console.error('[Search] Error:', error)
    return NextResponse.json(
      { error: 'An error occurred while searching' },
      { status: 500 }
    )
  }
}