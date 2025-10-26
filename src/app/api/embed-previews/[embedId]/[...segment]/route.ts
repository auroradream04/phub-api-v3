import { NextRequest, NextResponse } from 'next/server'
import { readSegment } from '@/lib/preview-downloader'

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
  { params }: { params: Promise<{ embedId: string; segment: string[] }> }
) {
  try {
    const { embedId, segment } = await params

    // Reconstruct filename from path segments (handles nested paths)
    const filename = segment.join('/')

    console.log('[Preview Segment] Serving segment:', embedId, filename)

    // Read the segment file from disk
    const buffer = await readSegment(embedId, filename)

    if (!buffer) {
      return NextResponse.json(
        { error: 'Segment not found' },
        { status: 404, headers: getCorsHeaders() }
      )
    }

    // Determine content type based on file extension
    let contentType = 'application/octet-stream'
    if (filename.endsWith('.ts')) {
      contentType = 'video/mp2t'
    } else if (filename.endsWith('.mp4')) {
      contentType = 'video/mp4'
    } else if (filename.endsWith('.m4s')) {
      contentType = 'video/iso.segment'
    }

    return new NextResponse(new Blob([new Uint8Array(buffer)]), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache segments for 24 hours
        'Content-Length': buffer.length.toString(),
        ...getCorsHeaders(),
      },
    })
  } catch (error) {
    console.error('[Preview Segment] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}
