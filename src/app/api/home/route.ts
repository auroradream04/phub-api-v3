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
    let result = null

    // ALWAYS use proxy - try up to 3 different proxies
    let retries = 3
    let attemptNum = 1

    while (retries > 0 && !result) {
      // Select proxy BEFORE making request
      const proxyInfo = getRandomProxy('Home API')

      if (!proxyInfo) {
        console.warn('[Home] No proxies available. Cannot make request.')
        break
      }

      console.log(`[Home] Attempt ${attemptNum}/3 using proxy ${proxyInfo.proxyUrl}`)
      pornhub.setAgent(proxyInfo.agent)

      const startTime = Date.now()
      try {
        const response = await pornhub.videoList({
          page,
          order: finalOrder as VideoListOrdering
        })

        const duration = Date.now() - startTime

        // Check for soft blocking (empty results)
        if (!response.data || response.data.length === 0) {
          console.log(`[Home] ⚠️  Proxy ${proxyInfo.proxyUrl} returned empty results (soft block) after ${duration}ms - trying different proxy...`)
        } else {
          console.log(`[Home] ✅ Proxy ${proxyInfo.proxyUrl} successful! Got ${response.data.length} videos in ${duration}ms`)
          result = response
        }
      } catch (error: unknown) {
        const duration = Date.now() - startTime
        console.error(`[Home] ❌ Proxy ${proxyInfo.proxyUrl} failed after ${duration}ms:`, error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
      attemptNum++
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
