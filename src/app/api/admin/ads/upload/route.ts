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

    // Validate file type
    const validTypes = ['video/mp4', 'video/webm', 'video/ogg']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only MP4, WebM, and Ogg videos are allowed.' },
        { status: 400 }
      )
    }

    // Generate unique ID for the ad
    const adId = crypto.randomBytes(16).toString('hex')

    // Create upload directory for this ad
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'ads', adId)
    await ensureUploadDir(uploadDir)

    // Save original file temporarily
    const tempFilePath = join(uploadDir, 'original.mp4')
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(tempFilePath, buffer)

    // Check if FFmpeg is available
    const hasFFmpeg = await checkFFmpeg()

    let duration = 0
    let segments: Array<{ quality: number, filepath: string, filesize: number }> = []

    if (hasFFmpeg) {
      try {
        // Get video duration first
        duration = await getVideoDuration(tempFilePath)
        console.log(`Video duration: ${duration} seconds`)

        // Convert to HLS segments
        const { segments: hlsSegments } = await convertToHLSSegments(
          tempFilePath,
          uploadDir,
          segmentDuration
        )

        console.log(`Created ${hlsSegments.length} segments`)

        // Create database segment records
        for (const segment of hlsSegments) {
          const segmentPath = join(uploadDir, segment.filename)
          const stats = await stat(segmentPath)

          segments.push({
            quality: segment.index, // Use index as quality (0, 1, 2, etc.)
            filepath: `/uploads/ads/${adId}/${segment.filename}`,
            filesize: stats.size
          })
        }

        // Delete original file after conversion
        await unlink(tempFilePath)

      } catch (error) {
        console.error('Failed to convert to HLS segments:', error)
        // Fallback: save as single file
        const fallbackPath = join(uploadDir, 'ad.mp4')
        await writeFile(fallbackPath, buffer)
        duration = 3 // Default duration
        segments = [{
          quality: 0,
          filepath: `/uploads/ads/${adId}/ad.mp4`,
          filesize: buffer.length
        }]
        await unlink(tempFilePath)
      }
    } else {
      // No FFmpeg, keep original
      console.warn('FFmpeg not available, keeping original format')
      const fallbackPath = join(uploadDir, 'ad.mp4')
      await writeFile(fallbackPath, buffer)
      duration = 3 // Default duration
      segments = [{
        quality: 0,
        filepath: `/uploads/ads/${adId}/ad.mp4`,
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
  } catch (error) {
    console.error('Error uploading ad:', error)
    return NextResponse.json(
      { error: 'Failed to upload ad' },
      { status: 500 }
    )
  }
}