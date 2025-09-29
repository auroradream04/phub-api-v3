import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { convertVideoToHLS } from '@/lib/ffmpeg'
import { writeFile, mkdir, unlink } from 'fs/promises'
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
    const duration = parseInt(formData.get('duration') as string) || 30

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

    // Convert video to HLS segments for different qualities
    let segments = []
    try {
      segments = await convertVideoToHLS(tempFilePath, uploadDir, adId)
      console.log(`Converted video to ${segments.length} qualities`)
    } catch (error) {
      console.error('FFmpeg conversion failed:', error)
      // If conversion fails, create a simple fallback segment
      segments = [{
        quality: 720,
        filepath: `/uploads/ads/${adId}/original.mp4`,
        filesize: buffer.length
      }]
    }

    // Create ad record in database with all segments
    const ad = await prisma.ad.create({
      data: {
        title,
        description: description || '',
        duration,
        status: status || 'active',
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

    // Clean up original file after conversion (keep it if conversion failed)
    if (segments.length > 1) {
      try {
        await unlink(tempFilePath)
      } catch {
        // Ignore cleanup errors
      }
    }

    return NextResponse.json(ad)
  } catch (error) {
    console.error('Error uploading ad:', error)
    return NextResponse.json(
      { error: 'Failed to upload ad' },
      { status: 500 }
    )
  }
}