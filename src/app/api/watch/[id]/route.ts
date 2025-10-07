import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id || id.trim() === '') {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      )
    }

    // Fetch video from database
    const video = await prisma.video.findUnique({
      where: { vodId: id },
    })

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      )
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:4444'

    // Return video info with predefined quality options
    // The actual video fetching happens in the stream endpoint
    const videoInfo = {
      title: video.vodName,
      views: video.views,
      rating: 0, // We don't store ratings
      duration: formatDuration(video.duration || 0),
      preview: video.vodPic || '',
      mediaDefinitions: [
        {
          quality: 1080,
          videoUrl: `${baseUrl}/api/watch/${id}/stream.m3u8?q=1080`,
          format: 'hls',
        },
        {
          quality: 720,
          videoUrl: `${baseUrl}/api/watch/${id}/stream.m3u8?q=720`,
          format: 'hls',
        },
        {
          quality: 480,
          videoUrl: `${baseUrl}/api/watch/${id}/stream.m3u8?q=480`,
          format: 'hls',
        },
      ],
      tags: video.vodContent ? video.vodContent.split(',').map(t => t.trim()) : [],
      pornstars: video.vodActor ? video.vodActor.split(',').map(p => p.trim()) : [],
      categories: [video.typeName],
    }

    return NextResponse.json(videoInfo, { status: 200 })

  } catch (error) {
    console.error('[API] Error fetching video info:', error)

    return NextResponse.json(
      { error: 'Failed to fetch video information' },
      { status: 500 }
    )
  }
}

// Helper to format duration from seconds to MM:SS or HH:MM:SS
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
