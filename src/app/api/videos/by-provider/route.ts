import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCategoryChineseName } from '@/lib/category-mapping'

export const revalidate = 3600 // 1 hour

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const provider = searchParams.get('provider')
    const typeName = searchParams.get('typeName') // Fallback category
    const limit = parseInt(searchParams.get('limit') || '6', 10)
    const excludeId = searchParams.get('exclude')

    if (!provider && !typeName) {
      return NextResponse.json(
        { error: 'Either provider or typeName parameter is required' },
        { status: 400 }
      )
    }

    interface VideoRecord {
      vodId: string
      vodName: string
      vodPic: string | null
      vodRemarks: string | null
      views: number
      typeName: string
      vodProvider: string | null
    }

    let videos: VideoRecord[] = []
    let usedFallback = false

    // First, try to fetch videos from the same provider
    if (provider) {
      videos = await prisma.video.findMany({
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
    }

    // If no provider videos found and we have typeName, fallback to category-based recommendations
    if (videos.length === 0 && typeName) {
      usedFallback = true
      videos = await prisma.video.findMany({
        where: {
          typeName: typeName,
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
    }

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
      usedFallback, // Indicate if we used category fallback
      provider,
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
