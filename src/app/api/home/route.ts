import { NextRequest, NextResponse } from 'next/server'
import { checkAndLogDomain } from '@/lib/domain-middleware'
import { prisma } from '@/lib/prisma'
import { getCategoryChineseName } from '@/lib/category-mapping'

export const revalidate = 3600 // 1 hour

export async function GET(_request: NextRequest) {
  const requestStart = Date.now()

  // Check domain access
  const domainCheck = await checkAndLogDomain(request, '/api/home', 'GET')
  if (!domainCheck.allowed) {
    return domainCheck.response // Returns 403 if blocked
  }

  try {
    const searchParams = request.nextUrl.searchParams

    // Parse query parameters
    const pageParam = searchParams.get('page')
    const page = pageParam ? parseInt(pageParam, 10) : 1
    const pageSize = 50

    // Fetch from database
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [videos, totalCount, todayUpdates] = await Promise.all([
      prisma.video.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          createdAt: 'desc' // Newest first
        }
      }),
      prisma.video.count(),
      prisma.video.count({
        where: {
          createdAt: {
            gte: today
          }
        }
      })
    ])

    // Log successful request
    await domainCheck.logRequest(200, Date.now() - requestStart)

    // Format videos to match expected response structure
    const data = videos.map((video) => ({
      id: video.vodId,
      title: video.vodName,
      preview: video.vodPic || '',
      duration: video.vodRemarks || '',
      views: video.views.toString(),
      rating: '0',
      category: getCategoryChineseName(video.typeName),
      createdAt: video.createdAt.toISOString()
    }))

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
