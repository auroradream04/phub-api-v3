import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptEmbedId } from '@/lib/embed-encryption'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    const { embedId: encryptedId } = await params

    // Decrypt the embed ID
    const embedId = decryptEmbedId(encryptedId)
    if (!embedId) {
      return NextResponse.json(
        { error: 'Invalid embed ID' },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    // Get embed from database
    const embed = await prisma.videoEmbed.findUnique({
      where: { id: embedId },
    })

    if (!embed || !embed.enabled) {
      return NextResponse.json(
        { error: 'Embed not found or disabled' },
        { status: 404, headers: getCorsHeaders() }
      )
    }

    // Fetch video preview data (image and video)
    let preview = null
    try {
      const proxyInfo = getRandomProxy('Embed Widget')
      if (proxyInfo) {
        const pornhub = new PornHub()
        pornhub.setAgent(proxyInfo.agent)

        // First get the video info for the image
        const videoInfo = await pornhub.video(embed.videoId)

        let previewVideo: string | undefined = undefined

        // Then search to get the preview video URL
        if (videoInfo && videoInfo.title) {
          try {
            const searchResults = await pornhub.searchVideo(videoInfo.title, { page: 1 })
            const matchedVideo = searchResults.data.find((v) => (v as any).id === embed.videoId)
            if (matchedVideo?.previewVideo) {
              previewVideo = matchedVideo.previewVideo
            }
          } catch (err) {
            console.warn('Error searching for preview video:', err)
            // Continue without preview video
          }
        }

        // Return whatever preview data we have
        if (videoInfo) {
          preview = {
            image: videoInfo.preview || null,
            video: previewVideo || null,
          }
        }
      }
    } catch (err) {
      console.error('Error fetching video preview for widget:', err)
      // Continue without preview - it's not critical
    }

    // Return widget data
    return NextResponse.json(
      {
        id: embed.id,
        videoId: embed.videoId,
        title: embed.title,
        redirectUrl: embed.redirectUrl,
        embedId: encryptedId, // Return encrypted ID for tracking
        preview, // Include preview data
      },
      {
        headers: {
          ...getCorsHeaders(),
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      }
    )
  } catch (error) {
    console.error('Error fetching embed widget:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}
