import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptEmbedId } from '@/lib/embed-encryption'

export async function GET(req: NextRequest, { params }: { params: Promise<{ embedId: string }> }) {
  try {
    const { embedId: encryptedId } = await params

    // Decrypt the embed ID
    const embedId = decryptEmbedId(encryptedId)
    if (!embedId) {
      return NextResponse.json({ error: 'Invalid embed ID' }, { status: 400 })
    }

    // Get embed from database
    const embed = await prisma.videoEmbed.findUnique({
      where: { id: embedId },
    })

    if (!embed || !embed.enabled) {
      return NextResponse.json({ error: 'Embed not found or disabled' }, { status: 404 })
    }

    // Return widget data
    return NextResponse.json({
      id: embed.id,
      videoId: embed.videoId,
      title: embed.title,
      preview: embed.preview,
      previewVideo: embed.previewVideo,
      redirectUrl: embed.redirectUrl,
      embedId: encryptedId, // Return encrypted ID for tracking
    })
  } catch (error) {
    console.error('Error fetching embed widget:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
