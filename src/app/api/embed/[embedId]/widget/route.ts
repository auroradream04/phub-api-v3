import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptEmbedId } from '@/lib/embed-encryption'

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
      console.error('[Embed] Widget route - Failed to decrypt ID', { encryptedId: encryptedId.substring(0, 20) + '...' })
      return NextResponse.json(
        { error: 'Invalid embed ID' },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    console.log('[Embed] Widget route - Decrypted ID successfully', { embedId })

    // Get embed from database
    const dbStart = Date.now()
    const embed = await prisma.videoEmbed.findUnique({
      where: { id: embedId },
    })
    const dbTime = Date.now() - dbStart

    if (!embed) {
      console.error('[Embed] Widget route - Embed not found in database', { embedId, dbTime })
      return NextResponse.json(
        { error: 'Embed not found or disabled' },
        { status: 404, headers: getCorsHeaders() }
      )
    }

    if (!embed.enabled) {
      console.warn('[Embed] Widget route - Embed is disabled', { embedId, dbTime })
      return NextResponse.json(
        { error: 'Embed not found or disabled' },
        { status: 404, headers: getCorsHeaders() }
      )
    }

    console.log('[Embed] Widget route - Embed found and enabled', { embedId, dbTime })



    // Fetch video preview from search route (cached with Next.js caching)
    let preview = null
    try {
      const searchStart = Date.now()
      const searchResponse = await fetch(`${req.nextUrl.origin}/api/embed/${encryptedId}/search`, {
        next: {
          revalidate: 7200, // Match search route's 2-hour cache
          tags: ['embed-preview', encryptedId], // For on-demand revalidation
        },
      })
      const searchTime = Date.now() - searchStart



      if (searchResponse.ok) {
        preview = await searchResponse.json()
      }
    } catch (err) {

      // Continue without preview - it's not critical
    }

    // Return widget data
    const totalTime = Date.now() - startTime


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

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}
