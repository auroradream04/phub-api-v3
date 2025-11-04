import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const variants = searchParams.getAll('variants')

    // Handle both single category and multiple variants
    const whereClause: any = {}

    if (variants && variants.length > 0) {
      // Multiple variants (for consolidated categories) - exact match
      whereClause.typeName = {
        in: variants,
      }
    } else if (category) {
      // Single category - exact match
      whereClause.typeName = category
    } else {
      return NextResponse.json(
        { error: 'Category or variants required' },
        { status: 400 }
      )
    }

    const dbVideos = await prisma.video.findMany({
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
      take: 20,
    })

    // Transform to match MACCMS format (vod_id, vod_name, etc.)
    const videos = dbVideos.map(v => ({
      vod_id: v.vodId,
      vod_name: v.vodName,
      vod_pic: v.vodPic || undefined,
      vod_hits: v.views,
      type_name: v.typeName,
    }))

    return NextResponse.json({ list: videos })
  } catch (error) {
    console.error('Failed to fetch videos by category:', error)
    return NextResponse.json(
      { error: 'Failed to fetch videos' },
      { status: 500 }
    )
  }
}
