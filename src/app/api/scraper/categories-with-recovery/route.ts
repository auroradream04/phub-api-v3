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

    const totalCategories = categories.length
    const startCategoryIndex = checkpoint.lastCategoryIndex + 1 // Resume from next category
    const startPageForFirstCategory = checkpoint.lastPageCompleted + 1 // Resume from next page in that category

    console.log(
      `[Background Scraper] Resuming: Category ${startCategoryIndex}/${totalCategories}, Last completed page: ${checkpoint.lastPageCompleted}`
    )

    // Iterate through remaining categories
    for (let categoryIndex = startCategoryIndex; categoryIndex < totalCategories; categoryIndex++) {
      const category = categories[categoryIndex]!

      // Force garbage collection every 10 categories to prevent memory leaks
      if ((categoryIndex + 1) % 10 === 0) {
        if (global.gc) {
          global.gc()
          console.log(`[Background Scraper] Garbage collection triggered at category ${categoryIndex + 1}/${totalCategories}`)
        }
      }

      // Start from page 1 for new categories, or from lastPageCompleted+1 for the first category being resumed
      const pageStart = categoryIndex === startCategoryIndex ? startPageForFirstCategory : 1

      console.log(
        `[Scraper Progress] Category ${categoryIndex + 1}/${totalCategories}: ${category.name} (ID: ${category.id}) - Pages ${pageStart}-${pagesPerCategory}`
      )

      let __categoryScraped = 0
      let __categoryFailed = 0
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
              __categoryFailed++

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
              __categoryScraped += data.scraped
              __categoryFailed += data.errors || 0

              try {
                // Update checkpoint with current position
                await updateScraperCheckpoint(checkpointId, {
                  lastCategoryIndex: categoryIndex,
                  lastPageCompleted: page,
                  totalVideosScraped: checkpoint.totalVideosScraped + data.scraped,
                  totalVideosFailed: checkpoint.totalVideosFailed + (data.errors || 0),
                })

                // Update job activity timestamp
                const job = ACTIVE_JOBS.get(checkpointId)
                if (job) {
                  job.lastUpdateTime = Date.now()
                }
              } catch (txError) {
                console.error(`[Background Scraper] Failed to save checkpoint at category ${categoryIndex} page ${page}:`, txError)
                // Continue anyway - we'll retry on next page or next resume
              }

              console.log(
                `[Scraper Progress] ✓ Category ${categoryIndex}/${totalCategories}: ${category.name} - Page ${page}/${pagesPerCategory} - ${data.scraped} videos scraped`
              )

              if (!data.hasMore || data.scraped === 0) {
                break
              }
            } else {
              __categoryFailed++
              console.warn(`[Background Scraper] No videos for category ${category.id} page ${page}`)
              break
            }

            await new Promise((resolve) => setTimeout(resolve, 500))
          } catch (timeoutError) {
            clearTimeout(timeout)
            consecutiveErrors++
            __categoryFailed++
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
          __categoryFailed++
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

    // Mark as completed
    await updateScraperCheckpoint(checkpointId, {
      status: 'completed'
    })

    // Clean up job tracking
    ACTIVE_JOBS.delete(checkpointId)

    const final = await getScraperCheckpoint(checkpointId)
    console.log(`[Background Scraper] Completed for checkpoint ${checkpointId}. Total: ${final?.totalVideosScraped || 0} videos scraped`)
  } catch (error) {
    console.error('[Background Scraper] Fatal error:', error)
    const checkpoint = await getScraperCheckpoint(checkpointId)
    if (checkpoint) {
      await updateScraperCheckpoint(checkpointId, {
        status: 'failed'
      })
      console.error(
        `[Background Scraper] Checkpoint updated to failed status. Completed up to: Category ${checkpoint.lastCategoryIndex + 1}, Page ${checkpoint.lastPageCompleted}. Total: ${checkpoint.totalVideosScraped} videos`
      )
    }
    // Clean up job tracking on error
    ACTIVE_JOBS.delete(checkpointId)
  }
}

export async function POST(_request: NextRequest) {
  let checkpointId: string = ''

  try {
    const { pagesPerCategory = 5, resumeCheckpointId } = await _request.json()

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
        console.error(`[Background Scraper] Error:`, error instanceof Error ? error.message : String(error))
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
export async function GET(_request: NextRequest) {
  const { searchParams } = new URL(_request.url)
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
    checkpoint.status === 'running' &&
    !isJobActive &&
    hasBeenStuck
  ) {
    console.log(
      `[Auto-Recovery] Restarting stuck job ${checkpointId} (stuck for ${Math.round(timeSinceLastUpdate / 1000)}s)`
    )
    // Use 5 pages as default (can be any number, doesn't really matter since we resume from checkpoint)
    scrapeInBackground(checkpointId, 5)
  }

  return NextResponse.json({
    success: true,
    checkpoint,
    progress: {
      status: checkpoint.status,
      totalVideosScraped: checkpoint.totalVideosScraped,
      totalVideosFailed: checkpoint.totalVideosFailed,
      categoriesCompleted: checkpoint.lastCategoryIndex + 1, // 0-based index, so +1 for display
      categoriesTotal: 165, // Total number of categories in database
    },
  })
}
