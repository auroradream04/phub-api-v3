import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import type { VideoListOrdering } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'

export const revalidate = 7200 // 2 hours

// Helper to fetch with retry logic for soft-blocking (empty data responses)
async function fetchWithRetry(
  fetchFn: (pornhub: PornHub) => Promise<{ data: unknown[] }>,
  maxRetries = 3
): Promise<{ data: unknown[] }> {
  let retries = maxRetries

  while (retries > 0) {
    // Create new PornHub instance with random proxy for this attempt
    const pornhub = new PornHub()
    const proxyInfo = getRandomProxy('Home API')
    if (proxyInfo) {
      pornhub.setAgent(proxyInfo.agent)
    }

    try {
      const result = await fetchFn(pornhub)

      // Check if PornHub is soft-blocking (returning empty data)
      if (!result.data || result.data.length === 0) {
        retries--
        if (retries > 0) {
          console.warn(`[Home API] Empty data received (soft-block), retrying with different proxy (${maxRetries - retries}/${maxRetries})...`)
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }
      }

      return result
    } catch (err) {
      retries--
      if (retries > 0) {
        console.warn(`[Home API] Request failed, retrying with different proxy (${maxRetries - retries}/${maxRetries})...`)
        await new Promise(resolve => setTimeout(resolve, 500))
        continue
      }
      throw err
    }
  }

  // Return empty result after all retries exhausted
  return { data: [] }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const pageParam = searchParams.get('page')
    const orderParam = searchParams.get('order')
    const filterCategoryParam = searchParams.get('filterCategory')

    // Default to page 1
    const page = pageParam ? parseInt(pageParam, 10) : 1

    // Map order parameter to PornHub.js VideoListOrdering
    let order: VideoListOrdering = 'Newest' // Default to newest for home feed

    if (orderParam) {
      if (orderParam === 'most-viewed' || orderParam.toLowerCase().includes('viewed')) {
        order = 'Most Viewed'
      } else if (orderParam === 'top-rated' || orderParam.toLowerCase().includes('rated')) {
        order = 'Top Rated'
      } else if (orderParam === 'longest') {
        order = 'Longest'
      } else if (orderParam === 'newest' || orderParam === 'recent') {
        order = 'Newest'
      } else if (orderParam === 'hottest') {
        order = 'Hottest'
      }
    }

    // Parse optional category filter
    const filterCategory = filterCategoryParam ? parseInt(filterCategoryParam, 10) : undefined

    // Fetch videos from PornHub with retry logic for soft-blocking
    const result = await fetchWithRetry(
      (pornhub) => pornhub.videoList({
        filterCategory,
        page,
        order
      })
    )

    // Check if we got empty results even after retries
    if (!result.data || result.data.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'PornHub returned no results after retries - possible rate limiting. Try again later.',
          data: [],
          paging: { current: page, maxPage: 1, isEnd: true },
          counting: { from: 0, to: 0, total: 0 }
        },
        { status: 200 }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    // Check if it's a JSON parse error (rate limiting)
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('JSON') || errorMessage.includes('DOCTYPE')) {
      return NextResponse.json(
        {
          success: false,
          error: 'PornHub is rate limiting requests. Please wait a moment and try again.',
          rateLimited: true
        },
        { status: 429 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage || 'Failed to fetch videos from PornHub'
      },
      { status: 500 }
    )
  }
}
