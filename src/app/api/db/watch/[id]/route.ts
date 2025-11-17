import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCategoryChineseName } from '@/lib/category-mapping'

export const revalidate = 7200 // 2 hours - cache for better performance

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id || id.trim() === '') {
      return NextResponse.json(
        { error: 'Invalid video ID' },
        { status: 400 }
      )
    }

    // Fetch video from database
    const video = await prisma.video.findUnique({
      where: { vodId: id }
    })

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      )
    }

    // Get base URL
    const protocol = request.headers.get('x-forwarded-proto') || 'http'
    const host = request.headers.get('host') || 'md8av.com'
    const baseUrl = `${protocol}://${host}`

    // Transform database record to API response
    const videoInfo = {
      id: video.vodId,
      title: video.vodName,
      views: video.views,
      rating: 0,
      duration: video.vodRemarks || '',
      preview: video.vodPic || '',
      mediaDefinitions: [
        {
          quality: 1080,
          videoUrl: `${baseUrl}/api/watch/${id}/stream.m3u8?q=1080`,
          format: 'hls',
          defaultQuality: false,
          remote: false
        },
        {
          quality: 720,
          videoUrl: `${baseUrl}/api/watch/${id}/stream.m3u8?q=720`,
          format: 'hls',
          defaultQuality: true,
          remote: false
        },
        {
          quality: 480,
          videoUrl: `${baseUrl}/api/watch/${id}/stream.m3u8?q=480`,
          format: 'hls',
          defaultQuality: false,
          remote: false
        }
      ],
      tags: [],
      pornstars: video.vodActor ? video.vodActor.split(',').map(a => a.trim()) : [],
      categories: [
        {
          id: video.typeId,
          name: getCategoryChineseName(video.typeName)
        }
      ],
      provider: video.vodProvider || '',
      premium: false
    }

    return NextResponse.json(videoInfo, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600'
      }
    })

  } catch (error) {
    console.error('[DB Watch API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch video' },
      { status: 500 }
    )
  }
}
