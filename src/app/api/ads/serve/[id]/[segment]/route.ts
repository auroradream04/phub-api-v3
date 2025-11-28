import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { getClientIP, getCountryFromIP } from '@/lib/geo'

export const revalidate = 7200 // 2 hours

// Simple in-memory deduplication (prevents counting same view multiple times)
// Key: `${ip}:${adId}:${videoId}` → timestamp
const recentImpressions = new Map<string, number>()
const DEDUPE_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

// Cleanup old entries periodically
function cleanupOldImpressions() {
  const now = Date.now()
  for (const [key, timestamp] of recentImpressions) {
    if (now - timestamp > DEDUPE_WINDOW_MS) {
      recentImpressions.delete(key)
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; segment: string }> }
) {
  try {
    const { id, segment } = await params
    const videoId = request.nextUrl.searchParams.get('v') || 'unknown'

    // Remove .ts extension if present
    const cleanSegment = segment.endsWith('.ts') ? segment.slice(0, -3) : segment
    const segmentIndex = parseInt(cleanSegment) || 0

    // Get the ad from database
    const ad = await prisma.ad.findUnique({
      where: { id },
      include: {
        segments: true
      }
    })

    if (!ad || ad.segments.length === 0) {
      return NextResponse.json(
        { error: 'Ad not found' },
        { status: 404 }
      )
    }

    // Get the specific segment
    const adSegment = ad.segments.find(s => s.quality === segmentIndex) || ad.segments[0]
    const filePath = join(process.cwd(), 'public', adSegment.filepath)

    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Ad file not found' },
        { status: 404 }
      )
    }

    // Track impression (non-blocking, with deduplication)
    const headers = request.headers
    const clientIP = getClientIP(headers)
    const dedupeKey = `${clientIP}:${id}:${videoId}`

    // Only record if not seen recently
    if (!recentImpressions.has(dedupeKey)) {
      recentImpressions.set(dedupeKey, Date.now())

      // Cleanup old entries occasionally (1 in 100 requests)
      if (Math.random() < 0.01) {
        cleanupOldImpressions()
      }

      // Record impression asynchronously (don't block response)
      getCountryFromIP(clientIP).then(country => {
        prisma.adImpression.create({
          data: {
            adId: id,
            videoId: videoId,
            referrer: headers.get('referer') || headers.get('origin') || 'direct',
            userAgent: headers.get('user-agent') || 'unknown',
            ipAddress: clientIP,
            country: country
          }
        }).catch(() => {
          // Failed to record impression - ignore
        })
      })
    }

    // Read the file
    const fileContent = await readFile(filePath)

    // Return the file content with proper headers
    return new Response(new Uint8Array(fileContent), {
      headers: {
        'Content-Type': 'video/mp2t',
        'Content-Length': fileContent.length.toString(),
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Accept-Ranges': 'bytes',
      },
    })

  } catch {
    return NextResponse.json(
      { error: 'Failed to serve ad segment' },
      { status: 500 }
    )
  }
}
