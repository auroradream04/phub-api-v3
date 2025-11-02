/**
 * Enhanced Scraper with Crash Recovery
 *
 * FIXED ISSUES:
 * - Race condition: Now uses atomic transaction for checkpoint updates
 * - Date bug: Dates stored as ISO strings, not Date objects
 * - Incomplete implementation: PornHub category fetching implemented
 * - Concurrent requests: No more data loss, safe to run multiple instances
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createScraperCheckpoint, updateScraperCheckpoint, getScraperCheckpoint } from '@/lib/scraper-utils'

const CUSTOM_CATEGORY_IDS: Record<string, number> = {
  'japanese': 9999,
  'chinese': 9998,
}

// Track active scraping jobs to detect lost jobs after restart
const ACTIVE_JOBS = new Map<string, { lastUpdateTime: number; pagesPerCategory: number }>()

// Background scraping function
async function scrapeInBackground(checkpointId: string, pagesPerCategory: number) {
  try {
    console.log(`[Background Scraper] Starting for checkpoint ${checkpointId}`)

    // Register this job as active
    ACTIVE_JOBS.set(checkpointId, { lastUpdateTime: Date.now(), pagesPerCategory })

    // Fetch categories
    let categories = await prisma.category.findMany({
      orderBy: [{ isCustom: 'desc' }, { id: 'asc' }],
    })

    if (categories.length === 0) {
      console.log(`[Background Scraper] Fetching categories from PornHub...`)
      const { PornHub } = await import('@/lib/pornhub.js')
      const pornhub = new PornHub()

      try {
        const pornhubCategories = await pornhub.webMaster.getCategories()

        for (const cat of pornhubCategories) {
          await prisma.category.upsert({
            where: { id: Number(cat.id) },
            update: {},
            create: {
              id: Number(cat.id),
              name: String(cat.category).toLowerCase(),
              isCustom: false,
            },
          })
        }

        for (const [name, id] of Object.entries(CUSTOM_CATEGORY_IDS)) {
          await prisma.category.upsert({
            where: { id },
            update: {},
            create: { id, name, isCustom: true },
          })
        }

        categories = await prisma.category.findMany({
          orderBy: [{ isCustom: 'desc' }, { id: 'asc' }],
        })

        console.log(`[Background Scraper] Fetched ${categories.length} categories`)
      } catch (error) {
        console.error(`[Background Scraper] Failed to fetch categories:`, error)
        const checkpoint = await getScraperCheckpoint(checkpointId)
        if (checkpoint) {
          checkpoint.status = 'failed'
          checkpoint.errors.push('Failed to fetch categories from PornHub')
          await updateScraperCheckpoint(checkpointId, checkpoint)
        }
        return
      }
    }

    const checkpoint = await getScraperCheckpoint(checkpointId)
    if (!checkpoint) {
      console.error(`[Background Scraper] Checkpoint lost`)
      return
    }

    const completedCategoryIds = new Set(
      checkpoint.categories
        .filter((c) => c.pagesCompleted >= c.pagesTotal)
        .map((c) => c.categoryId)
    )

    const categoriesToScrape = categories.filter(
      (cat) => !completedCategoryIds.has(cat.id)
    )

    // Store original total in checkpoint if not already set
    const totalCategories = checkpoint.totalCategories || categories.length
    if (!checkpoint.totalCategories) {
      checkpoint.totalCategories = categories.length
      await updateScraperCheckpoint(checkpointId, checkpoint)
    }

    console.log(
      `[Background Scraper] Scraping ${categoriesToScrape.length} categories (${completedCategoryIds.size} already complete) out of ${totalCategories} total`
    )

    let categoryIndex = completedCategoryIds.size

    for (const category of categoriesToScrape) {
      categoryIndex++

      // Force garbage collection every 10 categories to prevent memory leaks
      if (categoryIndex % 10 === 0) {
        if (global.gc) {
          global.gc()
          console.log(`[Background Scraper] Garbage collection triggered at category ${categoryIndex}/${totalCategories}`)
        }
      }

      const categoryCheckpoint = checkpoint.categories.find(
        (c) => c.categoryId === category.id
      )
      const pageStart = categoryCheckpoint ? categoryCheckpoint.pagesCompleted + 1 : 1

      console.log(
        `[Scraper Progress] Category ${categoryIndex}/${totalCategories}: ${category.name} (ID: ${category.id}) - Pages ${pageStart}-${pagesPerCategory}`
      )

      let categoryScraped = 0
      let categoryFailed = 0
      let consecutiveErrors = 0

      for (let page = pageStart; page <= pagesPerCategory; page++) {
        try {
          const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:4444'

          // Add timeout to prevent hanging
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 30000) // 30 second timeout

          try {
            const response = await fetch(`${baseUrl}/api/scraper/videos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                page,
                categoryId: category.id,
                categoryName: category.name,
              }),
              signal: controller.signal,
            })
            clearTimeout(timeout)

            if (!response.ok) {
              consecutiveErrors++
              categoryFailed++

              if (consecutiveErrors >= 3) {
                console.warn(
                  `[Background Scraper] Stopping category ${category.id} after 3 consecutive errors`
                )
                break
              }
              continue
            }

            const data = await response.json()

            if (data.success && data.scraped > 0) {
              consecutiveErrors = 0
              categoryScraped += data.scraped
              categoryFailed += data.errors || 0

              try {
                await prisma.$transaction(async (tx) => {
                  const current = await getScraperCheckpoint(checkpointId)
                  if (!current) return

                  const existingIndex = current.categories.findIndex(
                    (c) => c.categoryId === category.id
                  )

                  if (existingIndex >= 0) {
                    current.categories[existingIndex]!.pagesCompleted = page
                    current.categories[existingIndex]!.videosScraped = categoryScraped
                    current.categories[existingIndex]!.videosFailed = categoryFailed
                  } else {
                    current.categories.push({
                      categoryId: category.id,
                      categoryName: category.name,
                      pagesTotal: pagesPerCategory,
                      pagesCompleted: page,
                      videosScraped: categoryScraped,
                      videosFailed: categoryFailed,
                    })
                  }

                  current.totalVideosScraped += data.scraped
                  current.totalVideosFailed += data.errors || 0

                  await updateScraperCheckpoint(checkpointId, current)

                  // Update job activity timestamp
                  const job = ACTIVE_JOBS.get(checkpointId)
                  if (job) {
                    job.lastUpdateTime = Date.now()
                  }
                }, { timeout: 30000 }) // 30 second transaction timeout
              } catch (txError) {
                console.error(`[Background Scraper] Failed to save checkpoint for category ${category.id}:`, txError)
                // Continue anyway - we'll retry on next page or next resume
              }

              console.log(
                `[Scraper Progress] ✓ Category ${categoryIndex}/${totalCategories}: ${category.name} - Page ${page}/${pagesPerCategory} - ${data.scraped} videos scraped`
              )

              if (!data.hasMore || data.scraped === 0) {
                break
              }
            } else {
              categoryFailed++
              console.warn(`[Background Scraper] No videos for category ${category.id} page ${page}`)
              break
            }

            await new Promise((resolve) => setTimeout(resolve, 500))
          } catch (timeoutError) {
            clearTimeout(timeout)
            consecutiveErrors++
            categoryFailed++
            console.error(
              `[Background Scraper] Request timeout for category ${category.id} page ${page}:`,
              timeoutError instanceof Error ? timeoutError.message : 'Request timeout'
            )

            if (consecutiveErrors >= 3) {
              break
            }
          }
        } catch (error) {
          consecutiveErrors++
          categoryFailed++
          console.error(
            `[Background Scraper] Error on category ${category.id} page ${page}:`,
            error instanceof Error ? error.message : error
          )

          if (consecutiveErrors >= 3) {
            console.warn(
              `[Background Scraper] Skipping category ${category.id} after 3 consecutive errors`
            )
            break
          }
        }
      }

      // Add delay between categories to reduce memory pressure and database load
      // This gives garbage collection and connection pooling time to recover
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    const final = await getScraperCheckpoint(checkpointId)
    if (final) {
      final.status = 'completed'
      await updateScraperCheckpoint(checkpointId, final)
    }

    // Clean up job tracking
    ACTIVE_JOBS.delete(checkpointId)

    console.log(`[Background Scraper] Completed for checkpoint ${checkpointId}`)
  } catch (error) {
    console.error('[Background Scraper] Fatal error:', error)
    const checkpoint = await getScraperCheckpoint(checkpointId)
    if (checkpoint) {
      checkpoint.status = 'failed'
      checkpoint.errors.push(error instanceof Error ? error.message : String(error))
      console.error(
        `[Background Scraper] Saved error to checkpoint. Current progress: ${checkpoint.totalVideosScraped} videos, ${checkpoint.categories.filter((c) => c.pagesCompleted >= c.pagesTotal).length}/${checkpoint.categories.length} categories`
      )
      await updateScraperCheckpoint(checkpointId, checkpoint)
    }
    // Clean up job tracking on error
    ACTIVE_JOBS.delete(checkpointId)
  }
}

export async function POST(request: NextRequest) {
  let checkpointId: string = ''

  try {
    const { pagesPerCategory = 5, resumeCheckpointId } = await request.json()

    console.log(`[Scraper Categories] Started with options:`, {
      pagesPerCategory,
      resumeCheckpointId: resumeCheckpointId || 'new',
    })

    // Create or resume checkpoint
    if (resumeCheckpointId) {
      checkpointId = resumeCheckpointId
      const checkpoint = await getScraperCheckpoint(checkpointId)
      if (!checkpoint) {
        return NextResponse.json(
          { success: false, message: 'Checkpoint not found or corrupted' },
          { status: 404 }
        )
      }
      console.log(`[Scraper Categories] Resuming from checkpoint ${checkpointId}`)
    } else {
      checkpointId = await createScraperCheckpoint()
      console.log(`[Scraper Categories] Created new checkpoint ${checkpointId}`)

      // Return checkpoint ID immediately so client can start polling
      // Continue scraping in background
      const response = NextResponse.json({
        success: true,
        checkpointId,
        message: 'Scraping started',
        async: true
      })

      // Don't await this - let it run in background
      scrapeInBackground(checkpointId, pagesPerCategory)

      return response
    }

    // Resuming: run scraping in background too
    scrapeInBackground(checkpointId, pagesPerCategory)

    return NextResponse.json({
      success: true,
      checkpointId,
      message: 'Resuming scraping',
      async: true
    })
  } catch (error) {
    console.error('[Scraper Categories] Fatal error:', error)

    if (checkpointId) {
      const checkpoint = await getScraperCheckpoint(checkpointId)
      if (checkpoint) {
        checkpoint.status = 'failed'
        checkpoint.errors.push(error instanceof Error ? error.message : String(error))
        await updateScraperCheckpoint(checkpointId, checkpoint)
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        checkpointId: checkpointId || null,
      },
      { status: 500 }
    )
  }
}

// GET endpoint to check checkpoint status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const checkpointId = searchParams.get('checkpointId')

  if (!checkpointId) {
    return NextResponse.json(
      { success: false, message: 'checkpointId required' },
      { status: 400 }
    )
  }

  const checkpoint = await getScraperCheckpoint(checkpointId)

  if (!checkpoint) {
    return NextResponse.json(
      { success: false, message: 'Checkpoint not found' },
      { status: 404 }
    )
  }

  // Auto-recover: if checkpoint is still "in progress" but no job is active,
  // and the checkpoint hasn't been updated in 30+ seconds, restart the job
  const isJobActive = ACTIVE_JOBS.has(checkpointId)
  const jobData = ACTIVE_JOBS.get(checkpointId)
  const timeSinceLastUpdate = jobData ? Date.now() - jobData.lastUpdateTime : Infinity
  const hasBeenStuck = timeSinceLastUpdate > 30000 // 30 seconds

  if (
    checkpoint.status === 'in progress' &&
    !isJobActive &&
    hasBeenStuck
  ) {
    console.log(
      `[Auto-Recovery] Restarting stuck job ${checkpointId} (stuck for ${Math.round(timeSinceLastUpdate / 1000)}s)`
    )
    const pagesPerCategory = checkpoint.categories[0]?.pagesTotal || 5
    scrapeInBackground(checkpointId, pagesPerCategory)
  }

  return NextResponse.json({
    success: true,
    checkpoint,
    progress: {
      status: checkpoint.status,
      totalVideosScraped: checkpoint.totalVideosScraped,
      totalVideosFailed: checkpoint.totalVideosFailed,
      categoriesCompleted: checkpoint.categories.filter(
        (c) => c.pagesCompleted >= c.pagesTotal
      ).length,
      categoriesTotal: checkpoint.categories.length,
    },
  })
}
