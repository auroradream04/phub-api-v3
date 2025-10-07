import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const VIDEOS_PER_PAGE = 32

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ query: string }> }
) {
  try {
    const { query } = await params

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

    console.log(`[Search] Query: "${decodedQuery}", Page: ${page}`)

    // Search in database
    const [videos, totalCount] = await Promise.all([
      prisma.video.findMany({
        where: {
          OR: [
            { vodName: { contains: decodedQuery } },
            { vodContent: { contains: decodedQuery } },
            { vodActor: { contains: decodedQuery } },
          ],
        },
        orderBy: { vodTime: 'desc' },
        skip: (page - 1) * VIDEOS_PER_PAGE,
        take: VIDEOS_PER_PAGE,
      }),
      prisma.video.count({
        where: {
          OR: [
            { vodName: { contains: decodedQuery } },
            { vodContent: { contains: decodedQuery } },
            { vodActor: { contains: decodedQuery } },
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
    }

    console.log(`[Search] Found ${totalCount} results for "${decodedQuery}"`)

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })

  } catch (error) {
    console.error('[Search] Error:', error)
    return NextResponse.json(
      { error: 'An error occurred while searching' },
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
