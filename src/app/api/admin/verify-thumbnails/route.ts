import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  thumbnailExists,
  getThumbnailStats,
  deleteThumbnail,
} from '@/lib/thumbnail-downloader'
import fs from 'fs/promises'
import path from 'path'

const THUMBNAIL_DATA_DIR = path.join(process.cwd(), 'data', 'thumbnails')

/**
 * GET - Verify thumbnail integrity
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fullScan = searchParams.get('full') === 'true'
    const limit = parseInt(searchParams.get('limit') || '1000')

    const results = {
      dbToFile: {
        total: 0,
        missing: [] as string[],
        valid: 0,
      },
      fileToDB: {
        total: 0,
        orphaned: [] as string[],
        valid: 0,
      },
      diskStats: await getThumbnailStats(),
    }

    // Check DB → File (videos with local URLs should have files)
    const videosWithLocalThumbs = await prisma.video.findMany({
      where: { vodPic: { startsWith: '/api/thumbnails/' } },
      select: { vodId: true },
      take: fullScan ? undefined : limit,
    })

    results.dbToFile.total = videosWithLocalThumbs.length

    for (const video of videosWithLocalThumbs) {
      if (thumbnailExists(video.vodId)) {
        results.dbToFile.valid++
      } else {
        results.dbToFile.missing.push(video.vodId)
        // Limit missing list to 100 for response size
        if (results.dbToFile.missing.length >= 100) break
      }
    }

    // Check File → DB (files should have corresponding DB records)
    if (fullScan) {
      try {
        const files = await fs.readdir(THUMBNAIL_DATA_DIR)
        const imageFiles = files.filter(
          (f) => f.endsWith('.jpg') || f.endsWith('.png')
        )

        results.fileToDB.total = imageFiles.length

        // Check in batches to avoid memory issues
        const BATCH_SIZE = 500
        for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
          const batch = imageFiles.slice(i, i + BATCH_SIZE)
          const vodIds = batch.map((f) => f.replace(/\.(jpg|png)$/, ''))

          const existingVideos = await prisma.video.findMany({
            where: { vodId: { in: vodIds } },
            select: { vodId: true },
          })

          const existingVodIds = new Set(existingVideos.map((v) => v.vodId))

          for (const vodId of vodIds) {
            if (existingVodIds.has(vodId)) {
              results.fileToDB.valid++
            } else {
              if (results.fileToDB.orphaned.length < 100) {
                results.fileToDB.orphaned.push(vodId)
              }
            }
          }
        }
      } catch {
        // Directory might not exist yet
      }
    }

    const isHealthy =
      results.dbToFile.missing.length === 0 &&
      results.fileToDB.orphaned.length === 0

    return NextResponse.json({
      success: true,
      healthy: isHealthy,
      results,
      message: isHealthy
        ? 'All thumbnails verified successfully'
        : `Found ${results.dbToFile.missing.length} missing files, ${results.fileToDB.orphaned.length} orphaned files`,
    })
  } catch (error) {
    console.error('[Verify Thumbnails] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Verification failed' },
      { status: 500 }
    )
  }
}

/**
 * POST - Repair issues
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body.action as string

    if (action === 'fix-missing') {
      // Re-download missing thumbnails from vodPicOriginal
      const videosWithLocalThumbs = await prisma.video.findMany({
        where: {
          vodPic: { startsWith: '/api/thumbnails/' },
          vodPicOriginal: { not: null },
        },
        select: { id: true, vodId: true, vodPicOriginal: true },
        take: 100,
      })

      const missing: Array<{
        id: string
        vodId: string
        vodPicOriginal: string | null
      }> = []
      for (const video of videosWithLocalThumbs) {
        if (!thumbnailExists(video.vodId)) {
          missing.push(video)
        }
      }

      if (missing.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No missing thumbnails to fix',
          fixed: 0,
        })
      }

      let fixed = 0
      let failed = 0

      // Import download function
      const { downloadThumbnail } = await import('@/lib/thumbnail-downloader')

      for (const video of missing) {
        if (video.vodPicOriginal) {
          const success = await downloadThumbnail(
            video.vodId,
            video.vodPicOriginal
          )
          if (success) {
            fixed++
          } else {
            // Revert to original URL if can't download
            await prisma.video.update({
              where: { id: video.id },
              data: { vodPic: video.vodPicOriginal },
            })
            failed++
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Fixed ${fixed} missing thumbnails, ${failed} reverted to remote`,
        fixed,
        failed,
      })
    }

    if (action === 'cleanup-orphans') {
      // Delete orphaned files
      const files = await fs.readdir(THUMBNAIL_DATA_DIR)
      const imageFiles = files.filter(
        (f) => f.endsWith('.jpg') || f.endsWith('.png')
      )

      const vodIds = imageFiles.map((f) => f.replace(/\.(jpg|png)$/, ''))

      const existingVideos = await prisma.video.findMany({
        where: { vodId: { in: vodIds } },
        select: { vodId: true },
      })

      const existingVodIds = new Set(existingVideos.map((v) => v.vodId))
      let deleted = 0

      for (const vodId of vodIds) {
        if (!existingVodIds.has(vodId)) {
          await deleteThumbnail(vodId)
          deleted++
        }
      }

      return NextResponse.json({
        success: true,
        message: `Deleted ${deleted} orphaned thumbnails`,
        deleted,
      })
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action. Use: fix-missing, cleanup-orphans' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[Verify Thumbnails] Repair error:', error)
    return NextResponse.json(
      { success: false, error: 'Repair failed' },
      { status: 500 }
    )
  }
}
