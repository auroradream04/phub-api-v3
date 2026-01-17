import { NextRequest, NextResponse } from 'next/server'
import { readVariantSegment } from '@/lib/ad-transcoder'

export const revalidate = 7200 // 2 hours

/**
 * Serve ad segment from a format variant
 * GET /api/ads/serve/{adId}/{segmentIndex}/variant?format=30fps_1280x720&v=videoId
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; segment: string }> }
) {
  try {
    const { id: adId, segment } = await params
    const formatKey = request.nextUrl.searchParams.get('format')

    if (!formatKey) {
      return NextResponse.json(
        { error: 'Format parameter is required' },
        { status: 400 }
      )
    }

    // Remove .ts extension if present
    const cleanSegment = segment.endsWith('.ts') ? segment.slice(0, -3) : segment
    const segmentIndex = parseInt(cleanSegment) || 0

    // Read the variant segment
    const fileContent = await readVariantSegment(adId, formatKey, segmentIndex)

    if (!fileContent) {
      return NextResponse.json(
        { error: 'Variant segment not found' },
        { status: 404 }
      )
    }

    // Return the file content with proper headers
    return new Response(new Uint8Array(fileContent), {
      headers: {
        'Content-Type': 'video/mp2t',
        'Content-Length': fileContent.length.toString(),
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=86400', // 24 hours (variants are stable)
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Accept-Ranges': 'bytes',
      },
    })
  } catch (error) {
    console.error('[AdVariant] Error:', error)
    return NextResponse.json(
      { error: 'Failed to serve ad variant segment' },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
    },
  })
}
