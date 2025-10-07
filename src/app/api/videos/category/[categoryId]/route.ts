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

    // Fetch videos from PornHub for this category
    const result = await pornhub.videoList({
      filterCategory: categoryId,
      page,
      order
    })

    // Get category name from the categories list
    let categoryName = 'Unknown'
    try {
      const categories = await pornhub.webMaster.getCategories()
      const category = categories.find(cat => Number(cat.id) === categoryId)
      if (category) {
        categoryName = category.category
      }
    } catch (err) {
      console.warn('Could not fetch category name:', err)
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
    console.error('[API] Error fetching videos by category from PornHub:', error)

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

    console.log(`[Custom Category] ${categoryName}, Page: ${page} - Using PornHub search`)

    // Use PornHub search API to find videos
    const result = await pornhub.searchVideo(categoryName, {
      page
    })

    // Debug: Log first 3 video IDs to verify pagination
    console.log(`[Custom Category] Page ${page} first 3 IDs:`, result.data?.slice(0, 3).map(v => v.id))

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
    console.error('[Custom Category] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch custom category from PornHub'
      },
      { status: 500 }
    )
  }
}