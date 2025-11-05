import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { decryptEmbedId } from '@/lib/embed-encryption'

const trackEventSchema = z.object({
  eventType: z.enum(['impression', 'click']),
  referrerDomain: z.string().optional(),
  userAgent: z.string().optional(),
})

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

function hashIP(ipAddress: string | undefined): string | null {
  if (!ipAddress) return null
  return crypto.createHash('sha256').update(ipAddress).digest('hex')
}

function extractDomain(referrer: string | undefined): string | undefined {
  if (!referrer) return undefined
  try {
    const url = new URL(referrer)
    return url.hostname
  } catch {
    // Try to extract domain manually if not a valid URL
    const match = referrer.match(/^https?:\/\/([^\/?#]+)/)
    return match?.[1]
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ embedId: string }> }) {
  try {
    const { embedId: encryptedId } = await params

    // Decrypt the embed ID
    const embedId = decryptEmbedId(encryptedId)
    if (!embedId) {
      console.error('[Embed] Track route - Failed to decrypt ID', { encryptedId: encryptedId.substring(0, 20) + '...' })
      return NextResponse.json(
        { error: 'Invalid embed ID' },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    console.log('[Embed] Track route - Decrypted ID successfully', { embedId })

    // Verify embed exists and is enabled
    const embed = await prisma.videoEmbed.findUnique({
      where: { id: embedId },
    })

    if (!embed) {
      console.error('[Embed] Track route - Embed not found in database', { embedId })
      return NextResponse.json(
        { error: 'Embed not found or disabled' },
        { status: 404, headers: getCorsHeaders() }
      )
    }

    if (!embed.enabled) {
      console.warn('[Embed] Track route - Embed is disabled', { embedId })
      return NextResponse.json(
        { error: 'Embed not found or disabled' },
        { status: 404, headers: getCorsHeaders() }
      )
    }

    console.log('[Embed] Track route - Embed found and enabled', { embedId })

    // Parse request body
    const body = await req.json()
    const { eventType, referrerDomain, userAgent } = trackEventSchema.parse(body)

    // Get IP address from request
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
    const ipHash = hashIP(ipAddress || '')

    // Extract and validate referrer domain
    const refererHeader = req.headers.get('referer')
    const domain = referrerDomain || (refererHeader ? extractDomain(refererHeader) : undefined)

    // Record analytics
    await prisma.embedAnalytics.create({
      data: {
        embedId,
        eventType,
        referrerDomain: domain,
        userAgent: userAgent || refererHeader || undefined,
        ipHash,
      },
    })

    return NextResponse.json({ tracked: true }, { headers: getCorsHeaders() })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400, headers: getCorsHeaders() })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: getCorsHeaders() })
  }
}
