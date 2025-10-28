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

    // Build where clause based on category filter
    const whereClause: any = {}
    if (categoryParam) {
      // Find all typeName values that map to this Chinese category
      // For now, do a simple contains check since we're filtering by Chinese name
      whereClause.typeName = {
        not: ''
      }
    }

    const [videos, totalCount, todayUpdates] = await Promise.all([
      prisma.video.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          createdAt: 'desc' // Newest first
        },
        where: whereClause
      }),
      prisma.video.count({
        where: whereClause
      }),
      prisma.video.count({
        where: {
          ...whereClause,
          createdAt: {
            gte: today
          }
        }
      })
    ])

    // Format videos to match expected response structure
    let formattedVideos = videos.map((video) => ({
      id: video.vodId,
      title: video.vodName,
      preview: video.vodPic || '',
      duration: video.vodRemarks || '',
      views: video.views.toString(),
      rating: '0',
      category: getCategoryChineseName(video.typeName),
      createdAt: video.createdAt.toISOString(),
      typeName: video.typeName
    }))

    // Filter by category if provided
    if (categoryParam) {
      formattedVideos = formattedVideos.filter(video =>
        getCategoryChineseName(video.typeName) === categoryParam
      )
    }

    // Remove typeName from response
    const data = formattedVideos.map(({ typeName, ...video }) => video)

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
