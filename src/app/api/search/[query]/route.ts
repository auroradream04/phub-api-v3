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
    const pageParam = searchParams.get('page')
    const page = pageParam ? parseInt(pageParam, 10) : 1

    console.log(`[Search] Query: "${decodedQuery}", Page: ${page}`)

    const pornhub = new PornHub()
    let result

    // Try without proxy first
    try {
      result = await pornhub.searchVideo(decodedQuery, { page })
    } catch (error: unknown) {
      console.error('[Search] Request failed without proxy:', error instanceof Error ? error.message : 'Unknown error')
    }

    // Retry with proxy if initial request failed
    let retries = 3
    while ((!result || !result.data || result.data.length === 0) && retries > 0) {
      const proxyAgent = getRandomProxy()

      if (!proxyAgent) {
        console.warn('[Search] No proxies available. Cannot retry.')
        break
      }

      console.log(`[Search] Retrying with proxy (${retries} retries remaining)...`)
      pornhub.setAgent(proxyAgent)

      try {
        result = await pornhub.searchVideo(decodedQuery, { page })
      } catch (error: unknown) {
        console.error('[Search] Request failed with proxy:', error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
    }

    if (!result || !result.data) {
      throw new Error('Failed to fetch search results from PornHub')
    }

    console.log(`[Search] Found ${result.data.length} results for "${decodedQuery}"`)

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })

  } catch (error) {
    console.error('[Search] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An error occurred while searching'
      },
      { status: 500 }
    )
  }
}
