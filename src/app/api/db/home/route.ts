import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCategoryChineseName } from '@/lib/category-mapping'

export const revalidate = 3600 // 1 hour

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const pageParam = searchParams.get('page')
    const page = pageParam ? parseInt(pageParam, 10) : 1
    const pageSize = 50
    const categoryParam = searchParams.get('category')

    // Fetch from database
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Fetch ALL videos first (we need to filter client-side since category mapping is complex)
    const allVideos = await prisma.video.findMany({
      orderBy: {
        createdAt: 'desc' // Newest first
      }
    })

    // Format and filter by category if provided
    let formattedVideos = allVideos.map((video) => ({
      id: video.vodId,
      title: video.vodName,
      preview: video.vodPic || '',
      duration: video.vodRemarks || '',
      views: video.views.toString(),
      rating: '0',
      category: getCategoryChineseName(video.typeName),
      createdAt: video.createdAt.toISOString()
    }))

    // Filter by category if provided
    if (categoryParam) {
      formattedVideos = formattedVideos.filter(video =>
        video.category === categoryParam
      )
    }

    // Apply pagination after filtering
    const totalCount = formattedVideos.length
    const data = formattedVideos.slice((page - 1) * pageSize, page * pageSize)

    // Count today's updates
    const todayUpdates = allVideos.filter(v =>
      v.createdAt >= today && (!categoryParam || getCategoryChineseName(v.typeName) === categoryParam)
    ).length

    const response = {
      data,
      paging: {
        isEnd: (page * pageSize) >= totalCount
      },
      stats: {
        totalVideos: totalCount,
        todayUpdates
      }
    }

    return NextResponse.json(response, { status: 200 })

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
