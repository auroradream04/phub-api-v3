import { NextRequest, NextResponse } from 'next/server'
// import { prisma } from '@/lib/prisma'
import { downloadPreview } from '@/lib/preview-downloader'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Verify embed exists
    const embed = await prisma.videoEmbed.findUnique({
      where: { id },
    })

    if (!embed) {
      return NextResponse.json({ error: 'Embed not found' }, { status: 404 })
    }

    // Get the source (video ID, m3u8 URL, or video link)
    const source = embed.previewSourceUrl || embed.videoId
    if (!source) {
      return NextResponse.json(
        { error: 'No preview source provided (videoId, m3u8Url, or videoLink)' },
        { status: 400 }
      )
    }

    console.log('[Preview Download] Starting download for embed:', id, 'source:', source.substring(0, 50))

    // Download the preview
    const result = await downloadPreview(source)

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to download preview' },
        { status: 500 }
      )
    }

    // Update embed with preview info
    const updated = await prisma.videoEmbed.update({
      where: { id },
      data: {
        previewM3u8Path: result.m3u8Path,
        previewSegmentDir: result.segmentDir,
        previewDownloadedAt: new Date(),
        previewSourceUrl: source,
      },
    })

    console.log('[Preview Download] Successfully downloaded preview for embed:', id)

    return NextResponse.json({
      success: true,
      embedId: id,
      m3u8Path: result.m3u8Path,
      segmentDir: result.segmentDir,
      downloadedAt: updated.previewDownloadedAt,
    })
  } catch (error) {
    console.error('[Preview Download] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
