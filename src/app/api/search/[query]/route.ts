import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { checkAndLogDomain } from '@/lib/domain-middleware'

export const revalidate = 7200 // 2 hours

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ query: string }> }
) {
  const requestStart = Date.now()

  try {
    const { query } = await params

    // Check domain access
    const domainCheck = await checkAndLogDomain(request, `/api/search/${query}`, 'GET')
    if (!domainCheck.allowed) {
      return domainCheck.response
    }

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

    const pornhub = new PornHub()
    let result = null

    // ALWAYS use proxy - try up to 3 different proxies
    let retries = 3
    while (retries > 0 && !result) {
      // Select proxy BEFORE making request
      const proxyInfo = getRandomProxy('Search API')

      if (!proxyInfo) {
        break
      }

      pornhub.setAgent(proxyInfo.agent)

      try {
        const response = await pornhub.searchVideo(decodedQuery, { page })

        // Check for soft blocking (empty results)
        if (!response.data || response.data.length === 0) {
          // Try different proxy
        } else {
          result = response
        }
      } catch {
        // Try different proxy
      }

      retries--
    }

    if (!result || !result.data) {
      await domainCheck.logRequest(500, Date.now() - requestStart)
      throw new Error('Failed to fetch search results from PornHub')
    }

    // Log successful request
    await domainCheck.logRequest(200, Date.now() - requestStart)

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })

  } catch (error) {
    // Log error details for debugging (in development only)
    if (process.env.NODE_ENV === 'development') {
      console.error('[Search API] Error:', error)
    }

    // Return generic error message in production
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while searching. Please try again later.'
      },
      { status: 500 }
    )
  }
}
