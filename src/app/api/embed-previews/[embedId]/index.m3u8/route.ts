import { NextRequest, NextResponse } from 'next/server'
import { readM3u8 } from '@/lib/preview-downloader'

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(),
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ embedId: string }> }) {
  try {
    const { embedId } = await params

    console.log('[Preview M3U8] Serving m3u8 for embed:', embedId)

    // Read the m3u8 file from disk
    const m3u8Content = await readM3u8(embedId)

    if (!m3u8Content) {
      return NextResponse.json(
        { error: 'Preview not found' },
        { status: 404, headers: getCorsHeaders() }
      )
    }

    return new NextResponse(m3u8Content, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=3600',
        ...getCorsHeaders(),
      },
    })
  } catch (error) {
    console.error('[Preview M3U8] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}
