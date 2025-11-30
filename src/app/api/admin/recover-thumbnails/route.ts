import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PornHub } from '@/lib/pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import {
  downloadThumbnail,
  getThumbnailApiUrl,
  ensureThumbnailDir,
} from '@/lib/thumbnail-downloader'
import fs from 'fs/promises'
import path from 'path'

const FAILURES_FILE = path.join(process.cwd(), 'data', 'migration-failures.json')

interface MigrationFailure {
  vodId: string
  originalUrl: string
  error: string
  timestamp: string
  recoveryAttempted?: boolean
  recoveryError?: string
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

/**
 * GET - List failed thumbnails
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const failures = await loadFailures()

    return NextResponse.json({
      success: true,
      total: failures.length,
      failures: failures.slice(offset, offset + limit),
      hasMore: offset + limit < failures.length,
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to load failures' },
      { status: 500 }
    )
  }
}

/**
 * POST - Attempt recovery by re-scraping from PornHub
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const batchSize = Math.min(body.batchSize || 10, 50)
    const concurrency = Math.min(body.concurrency || 5, 10)

    await ensureThumbnailDir()

    const failures = await loadFailures()
    const toRecover = failures
      .filter((f) => !f.recoveryAttempted)
      .slice(0, batchSize)

    if (toRecover.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No failures to recover',
        processed: 0,
      })
    }

    let recovered = 0
    let stillFailed = 0
    const deleted = 0

    // Process in batches
    for (let i = 0; i < toRecover.length; i += concurrency) {
      const batch = toRecover.slice(i, i + concurrency)

      await Promise.all(
        batch.map(async (failure) => {
          try {
            // Check if video exists in our DB
            const video = await prisma.video.findFirst({
              where: { vodId: failure.vodId },
              select: { id: true, vodId: true, vodPic: true },
            })

            if (!video) {
              // Video doesn't exist in DB, just remove from failures
              failure.recoveryAttempted = true
              failure.recoveryError = 'Video not in database'
              return
            }

            // Try to fetch fresh thumbnail from PornHub
            const proxyInfo = getRandomProxy('Thumbnail Recovery')
            const pornhub = new PornHub()
            if (proxyInfo) {
              pornhub.setAgent(proxyInfo.agent)
            }

            try {
              // Search for video to get preview URL
              const searchResults = await pornhub.searchVideo(failure.vodId, {
                page: 1,
              })
              const match = searchResults.data.find(
                (v: { id: string }) => v.id === failure.vodId
              )

              if (match?.preview) {
                // Try to download the new thumbnail
                const success = await downloadThumbnail(
                  failure.vodId,
                  match.preview
                )

                if (success) {
                  // Update database
                  await prisma.video.update({
                    where: { id: video.id },
                    data: {
                      vodPicOriginal: match.preview,
                      vodPic: getThumbnailApiUrl(failure.vodId),
                    },
                  })

                  // Remove from failures
                  const idx = failures.findIndex(
                    (f) => f.vodId === failure.vodId
                  )
                  if (idx >= 0) failures.splice(idx, 1)

                  recovered++
                  return
                }
              }

              // If we get here, video wasn't found or thumbnail failed
              failure.recoveryAttempted = true
              failure.recoveryError = 'Video not found on PornHub or thumbnail unavailable'
              stillFailed++
            } catch (pornhubError) {
              failure.recoveryAttempted = true
              failure.recoveryError =
                pornhubError instanceof Error
                  ? pornhubError.message
                  : 'PornHub fetch failed'
              stillFailed++
            }
          } catch (error) {
            failure.recoveryAttempted = true
            failure.recoveryError =
              error instanceof Error ? error.message : 'Unknown error'
            stillFailed++
          }
        })
      )

      // Small delay between batches to avoid rate limiting
      if (i + concurrency < toRecover.length) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }

    // Save updated failures
    await saveFailures(failures)

    return NextResponse.json({
      success: true,
      message: `Processed ${toRecover.length} failures`,
      processed: toRecover.length,
      recovered,
      stillFailed,
      deleted,
      remainingFailures: failures.length,
    })
  } catch (error) {
    console.error('[Recover Thumbnails] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Recovery failed',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Delete unrecoverable videos from database
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const confirmDelete = body.confirm === true
    const deleteFromDb = body.deleteFromDb === true
    const deleteType = body.deleteType as 'failed' | 'pending' | undefined

    if (!confirmDelete) {
      // Return what would be deleted
      const failures = await loadFailures()
      const failed = failures.filter((f) => f.recoveryAttempted)
      const pending = await prisma.video.count({
        where: {
          vodPic: { startsWith: 'https://' },
          NOT: {
            vodPic: { contains: '/api/thumbnails/' }
          }
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Dry run - send confirm: true to actually delete',
        wouldDelete: deleteType === 'failed' ? failed.length : pending,
        samples: deleteType === 'failed'
          ? failed.slice(0, 10).map((f) => f.vodId)
          : undefined,
      })
    }

    let deletedCount = 0

    if (deleteType === 'failed') {
      // Delete unrecoverable failures
      const failures = await loadFailures()
      const failed = failures.filter((f) => f.recoveryAttempted)

      if (deleteFromDb && failed.length > 0) {
        const vodIds = failed.map((f) => f.vodId)
        for (let i = 0; i < vodIds.length; i += 100) {
          const chunk = vodIds.slice(i, i + 100)
          const result = await prisma.video.deleteMany({
            where: { vodId: { in: chunk } },
          })
          deletedCount += result.count
        }
      }

      // Remove failed from failure log
      const remainingFailures = failures.filter((f) => !f.recoveryAttempted)
      await saveFailures(remainingFailures)

      return NextResponse.json({
        success: true,
        message: `Deleted ${deletedCount} failed videos`,
        deletedFromDb: deletedCount,
      })
    } else if (deleteType === 'pending') {
      // Delete pending (remote URL) thumbnails
      if (deleteFromDb) {
        const result = await prisma.video.deleteMany({
          where: {
            vodPic: { startsWith: 'https://' },
            NOT: {
              vodPic: { contains: '/api/thumbnails/' }
            }
          },
        })
        deletedCount = result.count
      }

      return NextResponse.json({
        success: true,
        message: `Deleted ${deletedCount} pending videos`,
        deletedFromDb: deletedCount,
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid deleteType',
    })
  } catch (error) {
    console.error('[Recover Thumbnails] Delete error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed',
      },
      { status: 500 }
    )
  }
}
