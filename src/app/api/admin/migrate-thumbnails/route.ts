import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  downloadThumbnail,
  getThumbnailApiUrl,
  ensureThumbnailDir,
  getThumbnailStats,
} from '@/lib/thumbnail-downloader'
import fs from 'fs/promises'
import path from 'path'

const FAILURES_FILE = path.join(process.cwd(), 'data', 'migration-failures.json')

interface MigrationFailure {
  vodId: string
  originalUrl: string
  error: string
  timestamp: string
}

async function loadFailures(): Promise<MigrationFailure[]> {
  try {
    const content = await fs.readFile(FAILURES_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
}

async function saveFailures(failures: MigrationFailure[]): Promise<void> {
  await fs.writeFile(FAILURES_FILE, JSON.stringify(failures, null, 2))
}

async function addFailure(failure: MigrationFailure): Promise<void> {
  const failures = await loadFailures()
  // Avoid duplicates
  const existing = failures.findIndex((f) => f.vodId === failure.vodId)
  if (existing >= 0) {
    failures[existing] = failure
  } else {
    failures.push(failure)
  }
  await saveFailures(failures)
}

/**
 * GET - Get migration status
 */
export async function GET() {
  try {
    // Count videos by vodPic URL type
    const [totalCount, migratedCount, pendingCount] = await Promise.all([
      prisma.video.count(),
      prisma.video.count({
        where: { vodPic: { contains: '/api/thumbnails/' } },
      }),
      prisma.video.count({
        where: {
          vodPic: {
            startsWith: 'https://'
          },
          NOT: {
            vodPic: { contains: '/api/thumbnails/' }
          }
        },
      }),
    ])

    // Get failure count
    const failures = await loadFailures()

    // Get disk stats
    const diskStats = await getThumbnailStats()

    // Count videos with no image at all
    const noImageCount = await prisma.video.count({
      where: {
        OR: [{ vodPic: null }, { vodPic: '' }],
      },
    })

    return NextResponse.json({
      success: true,
      stats: {
        total: totalCount,
        migrated: migratedCount,
        pending: pendingCount,
        failed: failures.length,
        noImage: noImageCount,
        percentComplete:
          totalCount > 0
            ? Math.round((migratedCount / totalCount) * 100 * 100) / 100
            : 0,
      },
      disk: diskStats,
      message:
        pendingCount === 0
          ? 'Migration complete!'
          : `${pendingCount} videos remaining to migrate`,
    })
  } catch (error) {
    console.error('[Migrate Thumbnails] Status error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get status' },
      { status: 500 }
    )
  }
}

/**
 * POST - Run migration batch
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const batchSize = Math.min(body.batchSize || 100, 500) // Max 500 per batch
    const concurrency = Math.min(body.concurrency || 10, 20) // Max 20 concurrent
    const dryRun = body.dryRun === true

    await ensureThumbnailDir()

    // Get videos with remote URLs that need migration
    const videos = await prisma.video.findMany({
      where: {
        vodPic: { startsWith: 'https://' },
        NOT: {
          vodPic: { contains: '/api/thumbnails/' }
        }
      },
      select: {
        id: true,
        vodId: true,
        vodPic: true,
      },
      take: batchSize,
    })

    if (videos.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No videos to migrate',
        processed: 0,
        succeeded: 0,
        failed: 0,
      })
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `Dry run: would process ${videos.length} videos`,
        dryRun: true,
        wouldProcess: videos.length,
        sampleVideos: videos.slice(0, 5).map((v) => ({
          vodId: v.vodId,
          currentUrl: v.vodPic?.substring(0, 80) + '...',
        })),
      })
    }

    let succeeded = 0
    let failed = 0
    const startTime = Date.now()

    // Process in batches of `concurrency`
    for (let i = 0; i < videos.length; i += concurrency) {
      const batch = videos.slice(i, i + concurrency)

      const results = await Promise.all(
        batch.map(async (video) => {
          if (!video.vodPic) return { success: false, vodId: video.vodId }

          try {
            const downloadSuccess = await downloadThumbnail(
              video.vodId,
              video.vodPic
            )

            if (downloadSuccess) {
              // Update database
              await prisma.video.update({
                where: { id: video.id },
                data: {
                  vodPicOriginal: video.vodPic,
                  vodPic: getThumbnailApiUrl(video.vodId),
                },
              })
              return { success: true, vodId: video.vodId }
            } else {
              // Log failure
              await addFailure({
                vodId: video.vodId,
                originalUrl: video.vodPic,
                error: 'Download failed',
                timestamp: new Date().toISOString(),
              })
              return { success: false, vodId: video.vodId }
            }
          } catch (error) {
            await addFailure({
              vodId: video.vodId,
              originalUrl: video.vodPic || '',
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString(),
            })
            return { success: false, vodId: video.vodId }
          }
        })
      )

      succeeded += results.filter((r) => r.success).length
      failed += results.filter((r) => !r.success).length
    }

    const elapsed = Date.now() - startTime

    // Get updated stats
    const pendingCount = await prisma.video.count({
      where: {
        vodPic: { startsWith: 'https://' },
        NOT: {
          vodPic: { contains: '/api/thumbnails/' }
        }
      },
    })

    return NextResponse.json({
      success: true,
      message: `Processed ${videos.length} videos in ${elapsed}ms`,
      processed: videos.length,
      succeeded,
      failed,
      remaining: pendingCount,
      timeMs: elapsed,
      avgTimePerVideo: Math.round(elapsed / videos.length),
    })
  } catch (error) {
    console.error('[Migrate Thumbnails] Migration error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Migration failed',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Clear failure log
 */
export async function DELETE() {
  try {
    await saveFailures([])
    return NextResponse.json({
      success: true,
      message: 'Failure log cleared',
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to clear log' },
      { status: 500 }
    )
  }
}
