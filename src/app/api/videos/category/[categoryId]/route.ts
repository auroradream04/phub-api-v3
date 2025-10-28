import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import type { VideoListOrdering } from 'pornhub.js'

// Initialize PornHub client
const pornhub = new PornHub()

// Custom categories that use search instead of PornHub category IDs
// Map numeric IDs to category names for search
// IMPORTANT: PornHub has a bug where uppercase queries don't paginate correctly!
const CUSTOM_CATEGORIES: Record<number, string> = {
  9999: 'japanese', // lowercase to avoid PornHub pagination bug
  9998: 'chinese'   // lowercase to avoid PornHub pagination bug
}

export const revalidate = 7200 // 2 hours

// Helper to add timeout to promises
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 30000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
    )
  ])
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

    // Fetch videos from PornHub for this category with 30 second timeout
    const result = await withTimeout(
      pornhub.videoList({
        filterCategory: categoryId,
        page,
        order
      }),
      30000
    )

    // Get category name from the categories list (with timeout)
    let categoryName = 'Unknown'
    try {
      const categories = await withTimeout(
        pornhub.webMaster.getCategories(),
        10000 // shorter timeout for metadata fetch
      )
      const category = categories.find(cat => Number(cat.id) === categoryId)
      if (category) {
        categoryName = category.category
      }
    } catch (err) {
      // Silently fail - categoryName defaults to 'Unknown'
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

    // Use PornHub search API to find videos with 30 second timeout
    const result = await withTimeout(
      pornhub.searchVideo(categoryName, {
        page
      }),
      30000
    )

    // Check if PornHub is rate limiting or returning errors
    if (!result.data || result.data.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'PornHub returned no results - possible rate limiting. Try again in a few seconds.',
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