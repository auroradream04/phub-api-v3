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

    // Always use proxy - retry with different proxies if needed
    let retries = 3
    let attemptNum = 1
    while ((!result || !result.data || result.data.length === 0) && retries > 0) {
      const proxyInfo = getRandomProxy('Search API')

      if (!proxyInfo) {
        console.warn('[Search] No proxies available. Cannot retry.')
        break
      }

      console.log(`[Search] Attempt ${attemptNum}/3 for query "${decodedQuery}" using proxy ${proxyInfo.proxyUrl}`)
      pornhub.setAgent(proxyInfo.agent)

      const startTime = Date.now()
      try {
        result = await pornhub.searchVideo(decodedQuery, { page })

        const duration = Date.now() - startTime

        // Check for soft blocking (empty results)
        if (!result.data || result.data.length === 0) {
          console.log(`[Search] ⚠️  Proxy ${proxyInfo.proxyUrl} returned empty results (soft block) after ${duration}ms - trying different proxy...`)
          result = null
        } else {
          console.log(`[Search] ✅ Proxy ${proxyInfo.proxyUrl} successful! Got ${result.data.length} results in ${duration}ms`)
        }
      } catch (error: unknown) {
        const duration = Date.now() - startTime
        console.error(`[Search] ❌ Proxy ${proxyInfo.proxyUrl} failed after ${duration}ms:`, error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
      attemptNum++
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
