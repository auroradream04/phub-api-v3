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
      return NextResponse.json({ error: 'Invalid embed ID' }, { status: 400 })
    }

    // Verify embed exists and is enabled
    const embed = await prisma.videoEmbed.findUnique({
      where: { id: embedId },
    })

    if (!embed || !embed.enabled) {
      return NextResponse.json({ error: 'Embed not found or disabled' }, { status: 404 })
    }

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

    return NextResponse.json({ tracked: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    console.error('Error tracking embed event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
