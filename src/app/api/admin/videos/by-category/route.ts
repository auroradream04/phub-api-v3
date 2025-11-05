import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest) {
  try {
    const { searchParams } = new URL(_request.url)
    const category = searchParams.get('category')
    const variants = searchParams.getAll('variants')
    const search = searchParams.get('search')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = 20

    // Handle both single category and multiple variants
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = {}

    if (variants && variants.length > 0) {
      // Multiple variants (for consolidated categories) - exact match
      whereClause.typeName = {
        in: variants,
      }
    } else if (category) {
      // Single category - exact match
      whereClause.typeName = category
    } else if (search) {
      // Global search - search video names across all categories
      whereClause.vodName = {
        contains: search,
      }
    } else {
      return NextResponse.json(
        { error: 'Category, variants, or search required' },
        { status: 400 }
      )
    }

    const skip = (page - 1) * limit
    const [dbVideos, totalCount] = await Promise.all([
      prisma.video.findMany({
        where: whereClause,
        select: {
          vodId: true,
          vodName: true,
          vodPic: true,
          views: true,
          typeName: true,
        },
        orderBy: {
          vodTime: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.video.count({ where: whereClause }),
    ])

    // Transform to match MACCMS format (vod_id, vod_name, etc.)
    const videos = dbVideos.map(v => ({
      vod_id: v.vodId,
      vod_name: v.vodName,
      vod_pic: v.vodPic || undefined,
      vod_hits: v.views,
      type_name: v.typeName,
    }))

    return NextResponse.json({
      list: videos,
      page,
      pagesize: limit,
      pagecount: Math.ceil(totalCount / limit),
      total: totalCount,
    })
  } catch (error) {
    console.error('Failed to fetch videos by category:', error)
    return NextResponse.json(
      { error: 'Failed to fetch videos' },
      { status: 500 }
    )
  }
}
