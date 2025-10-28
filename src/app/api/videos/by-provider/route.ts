import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCategoryChineseName } from '@/lib/category-mapping'

export const revalidate = 3600 // 1 hour

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const provider = searchParams.get('provider')
    const limit = parseInt(searchParams.get('limit') || '6', 10)
    const excludeId = searchParams.get('exclude')

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider parameter is required' },
        { status: 400 }
      )
    }

    // Fetch videos from the same provider
    const videos = await prisma.video.findMany({
      where: {
        vodProvider: provider,
        ...(excludeId && { vodId: { not: excludeId } })
      },
      select: {
        vodId: true,
        vodName: true,
        vodPic: true,
        vodRemarks: true,
        views: true,
        typeName: true,
        vodProvider: true,
      },
      orderBy: {
        views: 'desc'
      },
      take: limit,
    })

    // Format response
    const data = videos.map((video) => ({
      id: video.vodId,
      title: video.vodName,
      preview: video.vodPic || '',
      duration: video.vodRemarks || '',
      views: video.views.toString(),
      category: getCategoryChineseName(video.typeName),
      provider: video.vodProvider || '',
    }))

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
    }, { status: 200 })

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch videos',
      },
      { status: 500 }
    )
  }
}
