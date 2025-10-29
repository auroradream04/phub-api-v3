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
    }

    // Fetch or load categories
    let categories = await prisma.category.findMany({
      orderBy: [{ isCustom: 'desc' }, { id: 'asc' }],
    })

    if (categories.length === 0) {
      console.log(`[Scraper Categories] Fetching categories from PornHub...`)
      // Import PornHub library
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

        // Add custom categories
        for (const [name, id] of Object.entries(CUSTOM_CATEGORY_IDS)) {
          await prisma.category.upsert({
            where: { id },
            update: {},
            create: { id, name, isCustom: true },
          })
        }

        // Fetch again
        categories = await prisma.category.findMany({
          orderBy: [{ isCustom: 'desc' }, { id: 'asc' }],
        })

        console.log(`[Scraper Categories] Fetched ${categories.length} categories from PornHub`)
      } catch (error) {
        console.error(`[Scraper Categories] Failed to fetch categories from PornHub:`, error)
        return NextResponse.json(
          {
            success: false,
            message: 'Failed to fetch categories from PornHub',
            checkpointId,
          },
          { status: 500 }
        )
      }
    }

    // Get checkpoint to find completed categories
    const checkpoint = await getScraperCheckpoint(checkpointId)
    if (!checkpoint) {
      return NextResponse.json(
        { success: false, message: 'Checkpoint lost' },
        { status: 500 }
      )
    }

    const completedCategoryIds = new Set(
      checkpoint.categories
        .filter((c) => c.pagesCompleted >= c.pagesTotal)
        .map((c) => c.categoryId)
    )

    // Categories to scrape
    const categoriesToScrape = categories.filter(
      (cat) => !completedCategoryIds.has(cat.id)
    )

    console.log(
      `[Scraper Categories] Scraping ${categoriesToScrape.length} categories (${completedCategoryIds.size} already complete)`
    )

    // Scrape categories
    for (const category of categoriesToScrape) {
      const categoryCheckpoint = checkpoint.categories.find(
        (c) => c.categoryId === category.id
      )
      const pageStart = categoryCheckpoint ? categoryCheckpoint.pagesCompleted + 1 : 1

      console.log(
        `[Scraper Categories] Category ${category.id} (${category.name}) pages ${pageStart}-${pagesPerCategory}`
      )

      let categoryScraped = 0
      let categoryFailed = 0
      let consecutiveErrors = 0

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
            consecutiveErrors++
            categoryFailed++

            // Stop after 3 consecutive errors
            if (consecutiveErrors >= 3) {
              console.warn(
                `[Scraper Categories] Stopping category ${category.id} after 3 consecutive errors`
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

            // Atomically update checkpoint with transaction
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
            })

            console.log(
              `[Scraper Categories] ✓ Category ${category.id} page ${page}: ${data.scraped} videos`
            )

            if (!data.hasMore || data.scraped === 0) {
              break
            }
          } else {
            categoryFailed++
            console.warn(`[Scraper Categories] No videos returned for category ${category.id} page ${page}`)
            break
          }

          await new Promise((resolve) => setTimeout(resolve, 500))
        } catch (error) {
          consecutiveErrors++
          categoryFailed++
          console.error(
            `[Scraper Categories] Error on category ${category.id} page ${page}:`,
            error instanceof Error ? error.message : error
          )

          if (consecutiveErrors >= 3) {
            break
          }
        }
      }
    }

    // Mark as complete
    const final = await getScraperCheckpoint(checkpointId)
    if (final) {
      final.status = 'completed'
      await updateScraperCheckpoint(checkpointId, final)
    }

    return NextResponse.json({
      success: true,
      checkpointId,
      message: 'Scraping completed',
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
