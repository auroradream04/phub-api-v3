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
  const startTime = Date.now()
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
    const dbStart = Date.now()
    const embed = await prisma.videoEmbed.findUnique({
      where: { id: embedId },
    })
    const dbTime = Date.now() - dbStart

    if (!embed || !embed.enabled) {
      return NextResponse.json(
        { error: 'Embed not found or disabled' },
        { status: 404, headers: getCorsHeaders() }
      )
    }

    console.log(`[Widget] DB query took ${dbTime}ms`)

    // Fetch video preview from search using title (already in database)
    let preview = null
    try {
      const proxyStart = Date.now()
      const proxyInfo = getRandomProxy('Embed Widget')
      const proxyTime = Date.now() - proxyStart

      if (proxyInfo) {
        const pornhub = new PornHub()
        pornhub.setAgent(proxyInfo.agent)

        console.log(`[Widget] Proxy selection took ${proxyTime}ms`)

        // Search by title (which we have in database) to get preview image and video
        const searchStart = Date.now()
        const searchResults = await pornhub.searchVideo(embed.title, { page: 1 })
        const searchTime = Date.now() - searchStart

        console.log(`[Widget] PornHub search took ${searchTime}ms`)

        const matchedVideo = searchResults.data.find((v) => (v as any).id === embed.videoId)

        if (matchedVideo) {
          preview = {
            image: (matchedVideo as any).preview || null,
            video: (matchedVideo as any).previewVideo || null,
          }
        }
      }
    } catch (err) {
      console.error('Error fetching video preview for widget:', err)
      // Continue without preview - it's not critical
    }

    // Return widget data
    const totalTime = Date.now() - startTime
    console.log(`[Widget] Total time: ${totalTime}ms`)

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
