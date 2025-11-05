import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || (session.user as { role?: string })?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Get ad with segments
    const ad = await prisma.ad.findUnique({
      where: { id },
      include: {
        segments: {
          where: {
            quality: { gte: 0 } // Only HLS segments, not preview
          },
          orderBy: { quality: 'asc' }
        }
      }
    })

    if (!ad || ad.segments.length === 0) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
    }

    // Generate HLS playlist
    const playlist = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${Math.ceil(ad.duration / ad.segments.length)}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD'
    ]

    // Add each segment
    for (const segment of ad.segments) {
      const segmentDuration = ad.duration / ad.segments.length
      playlist.push(`#EXTINF:${segmentDuration.toFixed(6)},`)
      playlist.push(segment.filepath)
    }

    playlist.push('#EXT-X-ENDLIST')

    return new Response(playlist.join('\n'), {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache'
      }
    })
  } catch {

    return NextResponse.json(
      { error: 'Failed to generate playlist' },
      { status: 500 }
    )
  }
}
