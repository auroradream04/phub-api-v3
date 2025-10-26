import { NextRequest, NextResponse } from 'next/server'
import { PornHub, VideoListOrdering } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { checkAndLogDomain } from '@/lib/domain-middleware'

export const revalidate = 7200 // 2 hours

export async function GET(request: NextRequest) {
  const requestStart = Date.now()

  // Check domain access
  const domainCheck = await checkAndLogDomain(request, '/api/home', 'GET')
  if (!domainCheck.allowed) {
    return domainCheck.response // Returns 403 if blocked
  }

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

        break
      }


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

        } else {

          result = response
        }
      } catch (error: unknown) {
        const duration = Date.now() - startTime

      }

      retries--
      attemptNum++
    }

    if (!result || !result.data) {
      // Log failed request
      await domainCheck.logRequest(500, Date.now() - requestStart)
      throw new Error('Failed to fetch video list from PornHub')
    }

    // Log successful request
    await domainCheck.logRequest(200, Date.now() - requestStart)

    return NextResponse.json(result, { status: 200 })

  } catch (error) {


    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch video list'
      },
      { status: 500 }
    )
  }
}
