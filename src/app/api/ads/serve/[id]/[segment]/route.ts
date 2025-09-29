import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; segment: string }> }
) {
  try {
    const { id, segment } = await params
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
      console.error(`Ad file not found: ${filePath}`)
      return NextResponse.json(
        { error: 'Ad file not found' },
        { status: 404 }
      )
    }

    // Read the file
    const fileContent = await readFile(filePath)

    // Return the file content with proper headers
    return new Response(fileContent, {
      headers: {
        'Content-Type': 'video/mp2t', // MPEG-TS content type
        'Content-Length': fileContent.length.toString(),
        'Content-Disposition': 'inline', // Force inline display, not download
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Accept-Ranges': 'bytes',
      },
    })

  } catch (error) {
    console.error('Error serving ad segment:', error)
    return NextResponse.json(
      { error: 'Failed to serve ad segment' },
      { status: 500 }
    )
  }
}