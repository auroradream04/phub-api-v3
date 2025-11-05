import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { convertToHLSSegments, getVideoDuration, checkFFmpeg } from '@/lib/ffmpeg-hls'
import { writeFile, mkdir, stat, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import crypto from 'crypto'
import type { Session } from 'next-auth'

// Helper function to ensure upload directory exists
async function ensureUploadDir(path: string) {
  if (!existsSync(path)) {
    await mkdir(path, { recursive: true })
  }
}

// POST - Upload new ad
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions) as Session | null

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user from the database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const title = formData.get('title') as string
    const description = formData.get('description') as string
    const status = formData.get('status') as string
    const weight = parseInt(formData.get('weight') as string) || 1
    const forceDisplay = formData.get('forceDisplay') === 'true'
    const segmentDuration = parseInt(formData.get('segmentDuration') as string) || 3 // Default 3 seconds per segment

    if (!file || !title) {
      return NextResponse.json(
        { error: 'File and title are required' },
        { status: 400 }
      )
    }

    // File size validation - 500MB max
    const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 413 }
      )
    }

    // Validate file type (MIME type check)
    const validTypes = ['video/mp4', 'video/webm', 'video/ogg']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only MP4, WebM, and Ogg videos are allowed.' },
        { status: 400 }
      )
    }

    // Validate file content (magic bytes)
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Check file signature (magic bytes) to verify actual file type
    const isValidMp4 = buffer.length >= 4 &&
      buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 &&
      (buffer[3] === 0x18 || buffer[3] === 0x20) // ftyp box

    const isValidWebM = buffer.length >= 4 &&
      buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3

    const isValidOgg = buffer.length >= 4 &&
      buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53

    if (!isValidMp4 && !isValidWebM && !isValidOgg) {
      return NextResponse.json(
        { error: 'Invalid video file. File content does not match the declared type.' },
        { status: 400 }
      )
    }

    // Generate unique ID for the ad
    const adId = crypto.randomBytes(16).toString('hex')

    // Create upload directory for this ad (store outside public for security)
    const uploadDir = join(process.cwd(), 'private', 'uploads', 'ads', adId)
    await ensureUploadDir(uploadDir)

    // Save original file temporarily
    const tempFilePath = join(uploadDir, 'original.mp4')
    await writeFile(tempFilePath, buffer)

    // Check if FFmpeg is available
    const hasFFmpeg = await checkFFmpeg()

    let duration = 0
    let segments: Array<{ quality: number, filepath: string, filesize: number }> = []

    if (hasFFmpeg) {
      try {
        // Get video duration first
        duration = await getVideoDuration(tempFilePath)


        // Convert to HLS segments
        const { segments: hlsSegments } = await convertToHLSSegments(
          tempFilePath,
          uploadDir,
          segmentDuration
        )



        // Create database segment records
        for (const segment of hlsSegments) {
          const segmentPath = join(uploadDir, segment.filename)
          const stats = await stat(segmentPath)

          segments.push({
            quality: segment.index, // Use index as quality (0, 1, 2, etc.)
            filepath: `/api/ads/serve/${adId}/${segment.filename}`, // Use API route instead of direct path
            filesize: stats.size
          })
        }

        // Delete temp file after conversion
        await unlink(tempFilePath)

      } catch {

        // Fallback: save as single file
        const fallbackPath = join(uploadDir, 'ad.mp4')
        await writeFile(fallbackPath, buffer)
        duration = 3 // Default duration
        segments = [{
          quality: 0,
          filepath: `/api/ads/serve/${adId}/ad.mp4`, // Use API route
          filesize: buffer.length
        }]
        await unlink(tempFilePath)
      }
    } else {
      // No FFmpeg, keep original

      const fallbackPath = join(uploadDir, 'ad.mp4')
      await writeFile(fallbackPath, buffer)
      duration = 3 // Default duration
      segments = [{
        quality: 0,
        filepath: `/api/ads/serve/${adId}/ad.mp4`, // Use API route
        filesize: buffer.length
      }]
      await unlink(tempFilePath)
    }

    // Create ad record in database with all segments
    const ad = await prisma.ad.create({
      data: {
        title,
        description: description || '',
        duration,
        status: status || 'active',
        weight,
        forceDisplay,
        userId: user.id,
        segments: {
          create: segments
        }
      },
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        },
        segments: {
          select: {
            quality: true,
            filesize: true,
            filepath: true
          }
        },
        _count: {
          select: {
            impressions: true
          }
        }
      }
    })

    return NextResponse.json(ad)
  } catch {

    return NextResponse.json(
      { error: 'Failed to upload ad' },
      { status: 500 }
    )
  }
}
