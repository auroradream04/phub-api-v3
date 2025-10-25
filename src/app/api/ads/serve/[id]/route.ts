import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export const revalidate = 7200 // 2 hours

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if there's a segment index in the URL
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const segmentIndex = pathParts[pathParts.length - 1] !== id ? parseInt(pathParts[pathParts.length - 1]) : 0

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

    // Get the specific segment or default to first
    const segment = ad.segments.find(s => s.quality === segmentIndex) || ad.segments[0]
    const filePath = join(process.cwd(), 'public', segment.filepath)

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
    return new Response(new Uint8Array(fileContent), {
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
    console.error('Error serving ad:', error)
    return NextResponse.json(
      { error: 'Failed to serve ad' },
      { status: 500 }
    )
  }
}