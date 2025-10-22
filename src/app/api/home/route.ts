import { NextRequest, NextResponse } from 'next/server'
import { PornHub, VideoListOrdering } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const pageParam = searchParams.get('page')
    const orderParam = searchParams.get('order')

    // Default to page 1
    const page = pageParam ? parseInt(pageParam, 10) : 1

    // Default to 'Featured Recently' if no order specified
    const order = orderParam || 'Featured Recently'

    // Validate order parameter (must match VideoListOrdering type)
    const validOrders = [
      'Featured Recently',
      'Most Viewed',
      'Top Rated',
      'Hottest',
      'Longest',
      'Newest'
    ]

    const finalOrder = validOrders.includes(order) ? order : 'Featured Recently'

    const pornhub = new PornHub()
    let result

    // Always use proxy - retry with different proxies if needed
    let retries = 3
    while ((!result || !result.data || result.data.length === 0) && retries > 0) {
      const proxyAgent = getRandomProxy()

      if (!proxyAgent) {
        console.warn('[Home] No proxies available. Cannot retry.')
        break
      }

      console.log(`[Home] Attempting request with random proxy (${retries} retries remaining)...`)
      pornhub.setAgent(proxyAgent)

      try {
        result = await pornhub.videoList({
          page,
          order: finalOrder as VideoListOrdering
        })

        // Check for soft blocking (empty results)
        if (!result.data || result.data.length === 0) {
          console.log('[Home] Received empty results (possible soft block), retrying with different proxy...')
          result = null
        }
      } catch (error: unknown) {
        console.error('[Home] Request failed with proxy:', error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
    }

    if (!result || !result.data) {
      throw new Error('Failed to fetch video list from PornHub')
    }

    return NextResponse.json(result, { status: 200 })

  } catch (error) {
    console.error('[API] Error fetching video list:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch video list'
      },
      { status: 500 }
    )
  }
}
