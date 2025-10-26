import { NextRequest, NextResponse } from 'next/server'
import { readVideo } from '@/lib/preview-downloader'

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(),
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ embedId: string; filename: string }> }
) {
  try {
    const { embedId, filename } = await params

    console.log('[Preview Video] Serving video:', embedId, filename)

    // Read the video file from disk
    const buffer = await readVideo(embedId, filename)

    if (!buffer) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404, headers: getCorsHeaders() }
      )
    }

    // Determine content type based on file extension
    let contentType = 'application/octet-stream'
    if (filename.endsWith('.webm')) {
      contentType = 'video/webm'
    } else if (filename.endsWith('.mp4')) {
      contentType = 'video/mp4'
    }

    return new NextResponse(new Blob([new Uint8Array(buffer)]), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'Content-Length': buffer.length.toString(),
        ...getCorsHeaders(),
      },
    })
  } catch (error) {
    console.error('[Preview Video] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}
