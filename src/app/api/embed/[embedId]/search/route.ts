import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptEmbedId } from '@/lib/embed-encryption'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'

// Cache search results for 2 hours
export const revalidate = 7200

interface SearchResult {
  id: string
  preview?: string
  previewVideo?: string
}

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
    const { embedId: encryptedId } = await params

    // Decrypt the embed ID
    const embedId = decryptEmbedId(encryptedId)
    if (!embedId) {
      return NextResponse.json(
        { error: 'Invalid embed ID' },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    // Get embed from database to get title for search
    const embed = await prisma.videoEmbed.findUnique({
      where: { id: embedId },
    })

    if (!embed || !embed.enabled) {
      return NextResponse.json(
        { error: 'Embed not found or disabled' },
        { status: 404, headers: getCorsHeaders() }
      )
    }

    // Search PornHub using title
    const proxyInfo = getRandomProxy('Embed Search')
    if (!proxyInfo) {
      return NextResponse.json(
        { error: 'No proxies available' },
        { status: 503, headers: getCorsHeaders() }
      )
    }

    const pornhub = new PornHub()
    pornhub.setAgent(proxyInfo.agent)

    const searchResults = await pornhub.searchVideo(embed.title, { page: 1 })
    const matchedVideo = searchResults.data.find((v: SearchResult) => v.id === embed.videoId)

    if (!matchedVideo) {
      return NextResponse.json(
        { preview: null },
        {
          headers: {
            ...getCorsHeaders(),
            'Cache-Control': 'public, max-age=7200', // Match revalidate period
          },
        }
      )
    }

    const preview = {
      image: (matchedVideo as SearchResult).preview || null,
      video: (matchedVideo as SearchResult).previewVideo || null,
    }

    return NextResponse.json(preview, {
      headers: {
        ...getCorsHeaders(),
        'Cache-Control': 'public, max-age=7200', // Match revalidate period
      },
    })
  } catch (error) {

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: getCorsHeaders() }
    )
  }
}
