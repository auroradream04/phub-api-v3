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

    // Check if we have a local self-hosted preview
    let previewUrl = null
    if (embed.previewM3u8Path) {
      // Use local preview
      previewUrl = `${req.nextUrl.origin}/api/${embed.previewM3u8Path}`
      console.log('[Embed] Widget route - Embed has previewM3u8Path:', embed.previewM3u8Path)
      console.log('[Embed] Widget route - Constructed preview URL:', previewUrl)
    } else {
      console.log('[Embed] Widget route - No local preview, trying dynamic search...');
      // Fall back to dynamic preview from search (cached with Next.js caching)
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
          const preview = await searchResponse.json()
          if (preview.video) {
            previewUrl = preview.video
            console.log('[Embed] Widget route - Using dynamic preview from search')
          }
        }
      } catch (err) {
        // Continue without preview - it's not critical
        console.log('[Embed] Widget route - Failed to fetch dynamic preview, continuing without it')
      }
    }

    // Return widget data
    const totalTime = Date.now() - startTime

    const responseData = {
      id: embed.id,
      videoId: embed.videoId,
      title: embed.title,
      redirectUrl: embed.redirectUrl,
      embedId: encryptedId, // Return encrypted ID for tracking
      previewUrl, // Return preview URL (local or dynamic)
    }

    console.log('[Embed] Widget route - Returning data:', JSON.stringify(responseData, null, 2))

    return NextResponse.json(
      responseData,
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
