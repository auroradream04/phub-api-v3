import { NextRequest, NextResponse } from 'next/server'
import { readThumbnail } from '@/lib/thumbnail-downloader'

// Cache thumbnails for 7 days
export const revalidate = 604800

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vodId: string }> }
) {
  try {
    const { vodId } = await params

    // Sanitize vodId
    const safeVodId = vodId.replace(/[^a-zA-Z0-9_-]/g, '')
    if (!safeVodId || safeVodId !== vodId) {
      return NextResponse.json(
        { error: 'Invalid vodId' },
        { status: 400 }
      )
    }

    const buffer = await readThumbnail(safeVodId)

    if (!buffer) {
      return NextResponse.json(
        { error: 'Thumbnail not found' },
        { status: 404 }
      )
    }

    // Detect content type from magic bytes
    const header = new Uint8Array(buffer.slice(0, 4))
    const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
    const contentType = isPng ? 'image/png' : 'image/jpeg'

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=604800, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('[Thumbnail API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
