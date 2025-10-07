import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const VIDEOS_PER_PAGE = 32

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const pageParam = searchParams.get('page')
    const orderParam = searchParams.get('order')

    // Default to page 1
    const page = pageParam ? parseInt(pageParam, 10) : 1

    // Default to 'Featured Recently' (newest)
    const order = orderParam || 'newest'

    // Build orderBy clause
    let orderBy: { vodTime?: 'desc'; views?: 'desc'; duration?: 'desc' } = { vodTime: 'desc' } // Default: newest first

    if (order === 'most-viewed' || order.toLowerCase().includes('viewed')) {
      orderBy = { views: 'desc' }
    } else if (order === 'top-rated' || order.toLowerCase().includes('rated')) {
      orderBy = { views: 'desc' } // We don't have ratings, use views
    } else if (order === 'longest') {
      orderBy = { duration: 'desc' }
    }

    // Fetch videos from database
    const [videos, totalCount] = await Promise.all([
      prisma.video.findMany({
        orderBy,
        skip: (page - 1) * VIDEOS_PER_PAGE,
        take: VIDEOS_PER_PAGE,
      }),
      prisma.video.count(),
    ])

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / VIDEOS_PER_PAGE)
    const isEnd = page >= totalPages

    // Format response to match PornHub.js structure
    const response = {
      data: videos.map(v => ({
        title: v.vodName,
        id: v.vodId,
        url: `https://localhost/watch/${v.vodId}`, // Placeholder URL
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
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[API] Error fetching video list:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
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
