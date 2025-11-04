import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCategoryChineseName } from '@/lib/category-mapping'
import { getConsolidatedFromDatabase, getVariantsForConsolidated, CONSOLIDATED_TO_CHINESE } from '@/lib/maccms-mappings'

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

    // Get variants for the consolidated category if provided
    let dbCategoryFilter: any = undefined
    if (categoryParam) {
      const variants = getVariantsForConsolidated(categoryParam)
      if (variants.length > 0) {
        dbCategoryFilter = {
          typeName: {
            in: variants.map(v => v.toLowerCase())
          }
        }
      }
    }

    // Fetch paginated videos with optional category filter
    const [allVideos, totalCount] = await Promise.all([
      prisma.video.findMany({
        where: dbCategoryFilter,
        orderBy: {
          createdAt: 'desc' // Newest first
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          vodId: true,
          vodName: true,
          vodPic: true,
          vodRemarks: true,
          views: true,
          typeName: true,
          createdAt: true
        }
      }),
      prisma.video.count({
        where: dbCategoryFilter
      })
    ])

    // Format videos
    const formattedVideos = allVideos.map((video) => {
      // Map database category to consolidated category
      const consolidatedCat = getConsolidatedFromDatabase(video.typeName)
      // Get Chinese name for consolidated category
      const chineseName = CONSOLIDATED_TO_CHINESE[consolidatedCat] || '其他'

      return {
        id: video.vodId,
        title: video.vodName,
        preview: video.vodPic || '',
        duration: video.vodRemarks || '',
        views: video.views.toString(),
        rating: '0',
        category: chineseName,
        consolidatedCategory: consolidatedCat,
        createdAt: video.createdAt.toISOString()
      }
    })

    // Count today's updates
    const todayUpdates = await prisma.video.count({
      where: {
        createdAt: { gte: today },
        ...dbCategoryFilter
      }
    })

    const response = {
      data: formattedVideos,
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
