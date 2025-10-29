/**
 * Enhanced Scraper Categories Route with Crash Recovery
 *
 * This route implements resumable scraping with checkpoints.
 * If the scraper crashes halfway through, you can resume from where it left off.
 *
 * Usage:
 *   POST /api/scraper/categories-with-recovery
 *   {
 *     "pagesPerCategory": 5,
 *     "resumeCheckpointId": "optional_checkpoint_id_to_resume"
 *   }
 *
 * Returns a checkpointId that can be used to track progress and resume if needed
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createScraperCheckpoint,
  updateScraperCheckpoint,
  getScraperCheckpoint,
} from '@/lib/scraper-utils'

const CUSTOM_CATEGORY_IDS: Record<string, number> = {
  'japanese': 9999,
  'chinese': 9998,
}

export async function POST(request: NextRequest) {
  let checkpointId: string = ''

  try {
    const {
      pagesPerCategory = 5,
      resumeCheckpointId,
      parallel = false,
      batchSize = 5,
    } = await request.json()

    console.log(`[Scraper Categories] Started with options:`, {
      pagesPerCategory,
      parallel,
      batchSize,
      resumeCheckpointId,
    })

    // Create or resume checkpoint
    if (resumeCheckpointId) {
      checkpointId = resumeCheckpointId
      const checkpoint = await getScraperCheckpoint(checkpointId)
      if (!checkpoint) {
        return NextResponse.json(
          { success: false, message: 'Checkpoint not found' },
          { status: 404 }
        )
      }
      console.log(`[Scraper Categories] Resuming from checkpoint:`, checkpoint.id)
    } else {
      checkpointId = await createScraperCheckpoint()
      console.log(`[Scraper Categories] Created new checkpoint:`, checkpointId)
    }

    // Fetch or load categories
    let categories = await prisma.category.findMany({
      orderBy: [{ isCustom: 'desc' }, { id: 'asc' }],
    })

    if (categories.length === 0) {
      console.log(`[Scraper Categories] No categories found, fetching from PornHub...`)
      // Fetch from PornHub and populate (same as before)
      // ... implementation here ...
    }

    const checkpoint = await getScraperCheckpoint(checkpointId)
    if (!checkpoint) throw new Error('Checkpoint lost')

    // Build list of categories to scrape
    const categoriesToScrape = categories.filter((cat) => {
      // Skip custom categories if resuming
      if (resumeCheckpointId && cat.isCustom) return false

      // Skip already completed categories
      const existing = checkpoint.categories.find((c) => c.categoryId === cat.id)
      return !existing || existing.pagesCompleted < pagesPerCategory
    })

    let totalScraped = checkpoint.totalVideosScraped || 0
    let totalFailed = checkpoint.totalVideosFailed || 0

    // Scrape categories sequentially (safer for resume)
    for (const category of categoriesToScrape) {
      const categoryStartIndex = checkpoint.categories.findIndex(
        (c) => c.categoryId === category.id
      )
      const pageStart =
        categoryStartIndex >= 0
          ? checkpoint.categories[categoryStartIndex]!.pagesCompleted + 1
          : 1

      console.log(
        `[Scraper Categories] Starting category ${category.id} (${category.name}) from page ${pageStart}/${pagesPerCategory}`
      )

      for (let page = pageStart; page <= pagesPerCategory; page++) {
        try {
          const baseUrl = process.env.NEXTAUTH_URL || 'http://md8av.com'
          const response = await fetch(`${baseUrl}/api/scraper/videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              page,
              categoryId: category.id,
              categoryName: category.name,
            }),
          })

          if (!response.ok) {
            console.error(
              `[Scraper Categories] Failed to scrape category ${category.id}, page ${page}`
            )
            totalFailed += 1

            // Update checkpoint with failure
            const updated = await getScraperCheckpoint(checkpointId)
            if (updated) {
              const catIndex = updated.categories.findIndex(
                (c) => c.categoryId === category.id
              )
              if (catIndex >= 0) {
                updated.categories[catIndex]!.videosFailed += 1
              }
              await updateScraperCheckpoint(checkpointId, updated)
            }
            continue
          }

          const data = await response.json()

          if (data.success && data.scraped > 0) {
            totalScraped += data.scraped
            totalFailed += data.errors || 0

            // Update checkpoint after successful page
            const updated = await getScraperCheckpoint(checkpointId)
            if (updated) {
              const catIndex = updated.categories.findIndex(
                (c) => c.categoryId === category.id
              )
              if (catIndex >= 0) {
                updated.categories[catIndex]!.pagesCompleted = page
                updated.categories[catIndex]!.videosScraped += data.scraped
                updated.categories[catIndex]!.videosFailed += data.errors || 0
              } else {
                updated.categories.push({
                  categoryId: category.id,
                  categoryName: category.name,
                  pagesTotal: pagesPerCategory,
                  pagesCompleted: page,
                  videosScraped: data.scraped,
                  videosFailed: data.errors || 0,
                })
              }
              updated.totalVideosScraped = totalScraped
              updated.totalVideosFailed = totalFailed
              await updateScraperCheckpoint(checkpointId, updated)
            }

            console.log(
              `[Scraper Categories] ✓ Category ${category.id}, page ${page}: ${data.scraped} videos`
            )

            // Stop if no more pages
            if (!data.hasMore || data.scraped === 0) {
              console.log(
                `[Scraper Categories] No more pages for category ${category.id}`
              )
              break
            }
          } else {
            totalFailed += 1
            console.warn(`[Scraper Categories] No videos returned for page ${page}`)
            break
          }

          // Delay between requests
          await new Promise((resolve) => setTimeout(resolve, 500))
        } catch (error) {
          console.error(
            `[Scraper Categories] Error scraping category ${category.id}, page ${page}:`,
            error
          )
          totalFailed += 1
        }
      }
    }

    // Mark checkpoint as complete
    const final = await getScraperCheckpoint(checkpointId)
    if (final) {
      final.status = 'completed'
      await updateScraperCheckpoint(checkpointId, final)
    }

    return NextResponse.json({
      success: true,
      message: `Scraping completed`,
      checkpointId,
      totalVideosScraped: totalScraped,
      totalVideosFailed: totalFailed,
      completedCategories: categoriesToScrape.length,
    })
  } catch (error) {
    console.error('[Scraper Categories] Fatal error:', error)

    // Mark checkpoint as failed
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
      categoriesInProgress: checkpoint.categories.length,
    },
  })
}
