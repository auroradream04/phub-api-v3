import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import type { VideoListOrdering } from 'pornhub.js'
import { prisma } from '@/lib/prisma'

// Initialize PornHub client
const pornhub = new PornHub()

const VIDEOS_PER_PAGE = 32

// Custom categories that use search instead of PornHub category IDs
// Map numeric IDs to category names for search
const CUSTOM_CATEGORIES: Record<number, string> = {
  9999: 'Japanese',
  9998: 'Chinese'
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

// Handle custom categories using search
async function handleCustomCategory(request: NextRequest, categoryId: number) {
  try {
    const searchParams = request.nextUrl.searchParams
    const pageParam = searchParams.get('page')
    const page = pageParam ? parseInt(pageParam, 10) : 1

    const categoryName = CUSTOM_CATEGORIES[categoryId]

    console.log(`[Custom Category] ${categoryName}, Page: ${page}`)

    // Search in database for this category
    const [videos, totalCount] = await Promise.all([
      prisma.video.findMany({
        where: {
          OR: [
            { vodName: { contains: categoryName } },
            { vodContent: { contains: categoryName } },
            { vodActor: { contains: categoryName } },
          ],
        },
        orderBy: { vodTime: 'desc' },
        skip: (page - 1) * VIDEOS_PER_PAGE,
        take: VIDEOS_PER_PAGE,
      }),
      prisma.video.count({
        where: {
          OR: [
            { vodName: { contains: categoryName } },
            { vodContent: { contains: categoryName } },
            { vodActor: { contains: categoryName } },
          ],
        },
      }),
    ])

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / VIDEOS_PER_PAGE)
    const isEnd = page >= totalPages

    // Format response to match PornHub.js structure
    const response = {
      data: videos.map(v => ({
        title: v.vodName,
        id: v.vodId,
        url: `${process.env.NEXTAUTH_URL || 'http://localhost:4444'}/watch/${v.vodId}`,
        views: v.views.toString(),
        duration: formatDuration(v.duration || 0),
        hd: v.vodRemarks?.includes('HD') || false,
        premium: false,
        freePremium: false,
        preview: v.vodPic || '',
        provider: v.vodActor || '',
      })),
      paging: {
        current: page,
        maxPage: totalPages,
        isEnd,
      },
      counting: {
        from: (page - 1) * VIDEOS_PER_PAGE + 1,
        to: Math.min(page * VIDEOS_PER_PAGE, totalCount),
        total: totalCount,
      },
      category: {
        id: categoryId,
        name: categoryName
      }
    }

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })
  } catch (error) {
    console.error('[Custom Category] Error:', error)
    return NextResponse.json(
      { error: 'An error occurred while fetching custom category' },
      { status: 500 }
    )
  }
}

// Helper to format duration from seconds to MM:SS
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}