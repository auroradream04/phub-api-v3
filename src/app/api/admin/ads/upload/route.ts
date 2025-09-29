import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { convertToTS, checkFFmpeg } from '@/lib/ffmpeg-simple'
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

    // Check if FFmpeg is available
    const hasFFmpeg = await checkFFmpeg()

    let adFilePath: string
    let filesize: number

    if (hasFFmpeg) {
      try {
        // Convert to .ts format for HLS compatibility
        const tsPath = join(uploadDir, 'ad.ts')
        await convertToTS(tempFilePath, tsPath)

        // Get file size of converted file
        const { size } = await import('fs').then(fs => fs.promises.stat(tsPath))
        filesize = size
        adFilePath = `/uploads/ads/${adId}/ad.ts`

        // Delete original after successful conversion
        await unlink(tempFilePath)

        console.log(`Ad converted to .ts format: ${adFilePath}`)
      } catch (error) {
        console.error('Failed to convert to .ts, using original:', error)
        // Fallback: keep original MP4
        const finalPath = join(uploadDir, 'ad.mp4')
        await writeFile(finalPath, buffer)
        await unlink(tempFilePath)
        adFilePath = `/uploads/ads/${adId}/ad.mp4`
        filesize = buffer.length
      }
    } else {
      // No FFmpeg available, keep original
      console.warn('FFmpeg not available, keeping original format')
      const finalPath = join(uploadDir, 'ad.mp4')
      await writeFile(finalPath, buffer)
      await unlink(tempFilePath)
      adFilePath = `/uploads/ads/${adId}/ad.mp4`
      filesize = buffer.length
    }

    const segments = [{
      quality: 0, // 0 means "default" - works for any quality
      filepath: adFilePath,
      filesize
    }]

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

    return NextResponse.json(ad)
  } catch (error) {
    console.error('Error uploading ad:', error)
    return NextResponse.json(
      { error: 'Failed to upload ad' },
      { status: 500 }
    )
  }
}