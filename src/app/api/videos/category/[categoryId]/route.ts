import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import type { VideoListOrdering } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
// import { prisma } from '@/lib/prisma'

// Custom categories that use search instead of PornHub category IDs
// Map numeric IDs to category names for search
// IMPORTANT: PornHub has a bug where uppercase queries don't paginate correctly!
const CUSTOM_CATEGORIES: Record<number, string> = {
  9999: 'japanese', // lowercase to avoid PornHub pagination bug
  9998: 'chinese'   // lowercase to avoid PornHub pagination bug
}

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
    const proxyInfo = getRandomProxy('Category API')
    if (proxyInfo) {
      pornhub.setAgent(proxyInfo.agent)
    }

    try {
      const result = await fetchFn(pornhub)

      // Check if PornHub is soft-blocking (returning empty data)
      if (!result.data || result.data.length === 0) {
        retries--
        if (retries > 0) {
          console.warn(`[Category API] Empty data received (soft-block), retrying with different proxy (${maxRetries - retries}/${maxRetries})...`)
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }
      }

      return result
    } catch {
      retries--
      if (retries > 0) {
        console.warn(`[Category API] Request failed, retrying with different proxy (${maxRetries - retries}/${maxRetries})...`)
        await new Promise(resolve => setTimeout(resolve, 500))
        continue
      }
      throw error
    }
  }

  // Return empty result after all retries exhausted
  return { data: [] }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  try {
    const searchParams = request.nextUrl.searchParams
    const { categoryId: categoryIdParam } = await params

    const categoryId = parseInt(categoryIdParam, 10)

    // Check if this is a custom category (numeric ID in 9998-9999 range)
    if (CUSTOM_CATEGORIES[categoryId]) {
      return handleCustomCategory(request, categoryId)
    }

    // Validate categoryId
    if (isNaN(categoryId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid category ID',
        },
        { status: 400 }
      )
    }

    // Parse query parameters
    const pageParam = searchParams.get('page')
    const orderParam = searchParams.get('order')

    // Default to page 1
    const page = pageParam ? parseInt(pageParam, 10) : 1

    // Map order parameter to PornHub.js VideoListOrdering
    let order: VideoListOrdering = 'Featured Recently' // Default

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

    // Fetch videos from PornHub with retry logic for soft-blocking
    const result = await fetchWithRetry(
      (pornhub) => pornhub.videoList({
        filterCategory: categoryId,
        page,
        order
      })
    )

    // Get category name from database (always authoritative)
    const dbCategory = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { name: true }
    })

    // Add category info to the response
    const response = {
      ...result,
      category: {
        id: categoryId,
        name: dbCategory?.name || 'unknown'
      }
    }

    return NextResponse.json(response)
  } catch (error) {


    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch videos from PornHub'
      },
      { status: 500 }
    )
  }
}

// Handle custom categories using PornHub search
async function handleCustomCategory(request: NextRequest, categoryId: number) {
  try {
    const searchParams = request.nextUrl.searchParams
    const pageParam = searchParams.get('page')
    const page = pageParam ? parseInt(pageParam, 10) : 1

    const categoryName = CUSTOM_CATEGORIES[categoryId]

    // Use retry logic for custom categories too
    const result = await fetchWithRetry(
      (pornhub) => pornhub.searchVideo(categoryName, { page })
    )

    // Check if PornHub is still returning empty after retries
    if (!result.data || result.data.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'PornHub returned no results after retries - possible rate limiting. Try again later.',
          data: [],
          paging: { current: page, maxPage: 1, isEnd: true },
          counting: { from: 0, to: 0, total: 0 },
          category: {
            id: categoryId,
            name: categoryName
          }
        },
        { status: 200 }
      )
    }

    // Add category info to the response
    const response = {
      ...result,
      category: {
        id: categoryId,
        name: categoryName
      }
    }

    return NextResponse.json(response)
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
        error: errorMessage || 'Failed to fetch custom category from PornHub'
      },
      { status: 500 }
    )
  }
}
