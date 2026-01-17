/**
 * ULTRA-OPTIMIZED Category Scraper with Crash Recovery
 *
 * OPTIMIZATIONS:
 * - In-memory cache of all vodIds + vodNames (loaded once at job start)
 * - Direct PornHub fetching (no internal API calls)
 * - Batch createMany for inserts (1 query per page instead of N)
 * - Category updates batched and flushed at job end
 * - Minimal delays (50ms page, 100ms category)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PornHub } from '@/lib/pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { createScraperCheckpoint, updateScraperCheckpoint, getScraperCheckpoint, parseViews, parseDuration, mergeCategories } from '@/lib/scraper-utils'
import { isTranslationEnabled, translateBatch } from '@/lib/translate'
import { getCanonicalCategory } from '@/lib/category-mapping'
import { downloadThumbnail, getThumbnailApiUrl, ensureThumbnailDir } from '@/lib/thumbnail-downloader'

const CUSTOM_CATEGORY_IDS: Record<string, number> = {
  'japanese': 9999,
  'chinese': 9998,
}

// Minimal delays - proxies handle rate limiting
const PAGE_DELAY_MS = 50
const CATEGORY_DELAY_MS = 100

// In-memory cache for a scraping job
interface VideoCache {
  vodIds: Map<string, string>  // vodId -> vodClass
  vodNames: Set<string>        // For deduplication
  pendingCategoryUpdates: Map<string, string>  // vodId -> newClass
}

// Track active scraping jobs
const ACTIVE_JOBS = new Map<string, {
  lastUpdateTime: number
  pagesPerCategory: number
  cache: VideoCache | null
}>()

interface ScrapedVideo {
  id: string
  views?: string
  duration: string
  title: string
  preview?: string
  provider?: string | { username?: string; name?: string }
}

function stripEmojis(str: string): string {
  return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F100}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/gu, '').trim()
}

function normalizeProvider(provider: unknown): string {
  if (!provider) return ''
  if (typeof provider === 'string') return provider
  if (typeof provider === 'object' && provider !== null) {
    const obj = provider as Record<string, unknown>
    return (obj.username as string) || (obj.name as string) || ''
  }
  return ''
}

// Load entire database into memory cache
async function loadVideoCache(): Promise<VideoCache> {
  console.log('[Category Scraper] Loading video cache...')
  const startTime = Date.now()

  const allVideos = await prisma.video.findMany({
    select: { vodId: true, vodClass: true, vodName: true }
  })

  const cache: VideoCache = {
    vodIds: new Map(),
    vodNames: new Set(),
    pendingCategoryUpdates: new Map(),
  }

  for (const video of allVideos) {
    cache.vodIds.set(video.vodId, video.vodClass || '')
    if (video.vodName) {
      cache.vodNames.add(video.vodName)
    }
  }

  const elapsed = Date.now() - startTime
  console.log(`[Category Scraper] Cache loaded: ${cache.vodIds.size} videos in ${elapsed}ms`)

  return cache
}

// Fetch videos from PornHub with retry
async function fetchVideosWithRetry(
  categoryId: number,
  page: number,
  maxRetries = 3
): Promise<{ data: ScrapedVideo[]; paging?: { isEnd?: boolean } }> {
  let retries = maxRetries

  while (retries > 0) {
    const pornhub = new PornHub()
    const proxyInfo = getRandomProxy('Category Scraper')
    if (proxyInfo) {
      pornhub.setAgent(proxyInfo.agent)
    }

    try {
      // Check if it's a custom category (japanese/chinese)
      if (categoryId === 9999 || categoryId === 9998) {
        const searchTerm = categoryId === 9999 ? 'japanese' : 'chinese'
        const result = await pornhub.searchVideo(searchTerm, { page })
        return result as { data: ScrapedVideo[]; paging?: { isEnd?: boolean } }
      }

      // Regular category
      const result = await pornhub.videoList({
        filterCategory: categoryId,
        page,
        order: 'Featured Recently'
      })

      if (!result.data || result.data.length === 0) {
        retries--
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }
      }

      return result as { data: ScrapedVideo[]; paging?: { isEnd?: boolean } }
    } catch (err) {
      retries--
      if (retries > 0) {
        console.warn(`[Category Scraper] Error fetching category ${categoryId} page ${page}, retrying: ${err instanceof Error ? err.message : err}`)
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }
      throw err
    }
  }

  return { data: [] }
}

// Process a page of videos using in-memory cache
async function processPageWithCache(
  categoryId: number,
  categoryName: string,
  page: number,
  shouldTranslate: boolean,
  minViews: number,
  minDuration: number,
  cache: VideoCache
): Promise<{ scraped: number; errors: number; duplicates: number; hasMore: boolean }> {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://md8av.com'

  try {
    const result = await fetchVideosWithRetry(categoryId, page)

    if (!result.data || result.data.length === 0) {
      return { scraped: 0, errors: 0, duplicates: 0, hasMore: false }
    }

    const canonicalCategory = getCanonicalCategory(categoryName)
    const publishDate = new Date()
    const year = publishDate.getFullYear().toString()

    // Filter videos
    const videosToProcess: Array<{
      vodId: string
      views: number
      durationSeconds: number
      cleanTitle: string
      cleanDuration: string
      cleanProvider: string
      preview?: string
    }> = []

    for (const video of result.data) {
      const views = parseViews(video.views || '0')
      const durationSeconds = parseDuration(video.duration)

      if (minViews > 0 && views < minViews) continue
      if (minDuration > 0 && durationSeconds < minDuration) continue

      videosToProcess.push({
        vodId: video.id,
        views,
        durationSeconds,
        cleanTitle: stripEmojis(video.title),
        cleanDuration: stripEmojis(video.duration),
        cleanProvider: stripEmojis(normalizeProvider(video.provider)),
        preview: video.preview,
      })
    }

    if (videosToProcess.length === 0) {
      return { scraped: 0, errors: 0, duplicates: 0, hasMore: !result.paging?.isEnd }
    }

    // Batch translate if enabled
    let translatedTitles: string[] = videosToProcess.map(v => v.cleanTitle)
    let translationFailed: boolean[] = videosToProcess.map(() => false)

    if (shouldTranslate) {
      const translationResults = await translateBatch(videosToProcess.map(v => v.cleanTitle))
      translatedTitles = translationResults.map((r, i) => r.success ? r.text : videosToProcess[i]!.cleanTitle)
      translationFailed = translationResults.map(r => !r.success)
    }

    // Prepare videos using IN-MEMORY CACHE (no DB queries!)
    const videosToCreate: Array<{
      vodId: string
      vodName: string
      originalTitle?: string
      typeId: number
      typeName: string
      vodClass: string
      vodEn: string
      vodTime: Date
      vodRemarks: string
      vodPlayFrom: string
      vodPic?: string
      vodPicOriginal?: string
      vodArea: string
      vodLang: string
      vodYear: string
      vodActor: string
      vodDirector: string
      vodContent: string
      vodPlayUrl: string
      vodProvider: string
      views: number
      duration: number
      needsTranslation: boolean
      translationFailedAt: Date | null
      translationRetryCount: number
    }> = []

    let duplicateCount = 0

    for (let i = 0; i < videosToProcess.length; i++) {
      const video = videosToProcess[i]!
      const title = translatedTitles[i]!
      const failed = translationFailed[i]!

      // Check cache instead of DB
      if (cache.vodIds.has(video.vodId)) {
        // Video exists - queue category update
        const currentClass = cache.vodIds.get(video.vodId)!
        const mergedClass = mergeCategories(currentClass, canonicalCategory)
        if (mergedClass !== currentClass) {
          cache.pendingCategoryUpdates.set(video.vodId, mergedClass)
          cache.vodIds.set(video.vodId, mergedClass)
        }
        duplicateCount++
        continue
      }

      // New video - deduplicate name using cache
      let finalName = title
      let suffix = 2
      while (cache.vodNames.has(finalName)) {
        finalName = `${title} (${suffix})`
        suffix++
        if (suffix > 1000) {
          finalName = `${title} (${Math.random().toString(36).substring(7)})`
          break
        }
      }

      // Add to cache immediately
      cache.vodIds.set(video.vodId, canonicalCategory)
      cache.vodNames.add(finalName)

      const vodEn = finalName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50)

      videosToCreate.push({
        vodId: video.vodId,
        vodName: finalName,
        originalTitle: shouldTranslate ? video.cleanTitle : undefined,
        typeId: categoryId,
        typeName: canonicalCategory,
        vodClass: canonicalCategory,
        vodEn,
        vodTime: publishDate,
        vodRemarks: `HD ${video.cleanDuration}`,
        vodPlayFrom: 'dplayer',
        vodPic: video.preview, // Will be updated after thumbnail download
        vodPicOriginal: video.preview, // Store original URL
        vodArea: 'CN',
        vodLang: 'zh',
        vodYear: year,
        vodActor: video.cleanProvider,
        vodDirector: '',
        vodContent: finalName,
        vodPlayUrl: `HD$${baseUrl}/api/watch/${video.vodId}/stream.m3u8?q=720`,
        vodProvider: video.cleanProvider,
        views: video.views,
        duration: video.durationSeconds,
        needsTranslation: failed,
        translationFailedAt: failed ? new Date() : null,
        translationRetryCount: 0,
      })
    }

    // Download thumbnails in parallel (10 concurrent)
    if (videosToCreate.length > 0) {
      await ensureThumbnailDir()
      const THUMBNAIL_CONCURRENCY = 10

      for (let i = 0; i < videosToCreate.length; i += THUMBNAIL_CONCURRENCY) {
        const batch = videosToCreate.slice(i, i + THUMBNAIL_CONCURRENCY)
        await Promise.all(
          batch.map(async (video) => {
            if (video.vodPicOriginal) {
              const success = await downloadThumbnail(video.vodId, video.vodPicOriginal)
              if (success) {
                video.vodPic = getThumbnailApiUrl(video.vodId)
              }
              // If download fails, vodPic keeps the original remote URL as fallback
            }
          })
        )
      }
    }

    // Batch insert (single query!)
    let createdCount = 0
    if (videosToCreate.length > 0) {
      try {
        const result = await prisma.video.createMany({
          data: videosToCreate,
          skipDuplicates: true,
        })
        createdCount = result.count
      } catch (err) {
        console.error(`[Category Scraper] Batch create failed:`, err)
        // Fallback to one-by-one
        for (const video of videosToCreate) {
          try {
            await prisma.video.create({ data: video })
            createdCount++
          } catch {
            // Skip duplicates
          }
        }
      }
    }

    const hasMore = !result.paging?.isEnd && result.data.length > 0

    return {
      scraped: createdCount,
      errors: videosToCreate.length - createdCount,
      duplicates: duplicateCount,
      hasMore
    }
  } catch (err) {
    console.error(`[Category Scraper] Error for category ${categoryId} page ${page}:`, err)
    return { scraped: 0, errors: 1, duplicates: 0, hasMore: false }
  }
}

// Flush pending category updates
async function flushCategoryUpdates(cache: VideoCache): Promise<number> {
  if (cache.pendingCategoryUpdates.size === 0) return 0

  console.log(`[Category Scraper] Flushing ${cache.pendingCategoryUpdates.size} category updates...`)

  const updateGroups = new Map<string, string[]>()
  for (const [vodId, newClass] of cache.pendingCategoryUpdates) {
    if (!updateGroups.has(newClass)) {
      updateGroups.set(newClass, [])
    }
    updateGroups.get(newClass)!.push(vodId)
  }

  let totalUpdated = 0
  for (const [newClass, vodIds] of updateGroups) {
    try {
      for (let i = 0; i < vodIds.length; i += 1000) {
        const chunk = vodIds.slice(i, i + 1000)
        const result = await prisma.video.updateMany({
          where: { vodId: { in: chunk } },
          data: { vodClass: newClass }
        })
        totalUpdated += result.count
      }
    } catch (err) {
      console.error(`[Category Scraper] Category update failed:`, err)
    }
  }

  cache.pendingCategoryUpdates.clear()
  console.log(`[Category Scraper] Updated ${totalUpdated} video categories`)
  return totalUpdated
}

// Background scraping function
async function scrapeInBackground(
  checkpointId: string,
  pagesPerCategory: number,
  filterCategoryIds?: number[],
  filterCategoryNames?: string[]
) {
  try {
    console.log(`[Category Scraper] Starting for checkpoint ${checkpointId}`)

    // Load settings
    const minViewsSetting = await prisma.siteSetting.findUnique({ where: { key: 'scraper_min_views' } })
    const minDurationSetting = await prisma.siteSetting.findUnique({ where: { key: 'scraper_min_duration' } })
    const minViews = minViewsSetting ? parseInt(minViewsSetting.value) : 0
    const minDuration = minDurationSetting ? parseInt(minDurationSetting.value) : 0
    const shouldTranslate = await isTranslationEnabled()

    // Load video cache (once!)
    const cache = await loadVideoCache()

    // Register job with cache
    ACTIVE_JOBS.set(checkpointId, { lastUpdateTime: Date.now(), pagesPerCategory, cache })

    // Fetch categories
    let categories = await prisma.category.findMany({
      orderBy: [{ isCustom: 'desc' }, { id: 'asc' }],
    })

    if (categories.length === 0) {
      console.log(`[Category Scraper] Fetching categories from PornHub...`)
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

        console.log(`[Category Scraper] Fetched ${categories.length} categories`)
      } catch (error) {
        console.error(`[Category Scraper] Failed to fetch categories:`, error)
        await updateScraperCheckpoint(checkpointId, { status: 'failed' })
        ACTIVE_JOBS.delete(checkpointId)
        return
      }
    }

    // Apply filters
    if (filterCategoryIds && filterCategoryIds.length > 0) {
      categories = categories.filter((cat) => filterCategoryIds.includes(cat.id))
      console.log(`[Category Scraper] Filtered to ${categories.length} categories by ID`)
    } else if (filterCategoryNames && filterCategoryNames.length > 0) {
      const normalizedNames = filterCategoryNames.map((name) => name.toLowerCase().trim())
      categories = categories.filter((cat) => normalizedNames.includes(cat.name.toLowerCase()))
      console.log(`[Category Scraper] Filtered to ${categories.length} categories by name`)
    }

    const checkpoint = await getScraperCheckpoint(checkpointId)
    if (!checkpoint) {
      console.error(`[Category Scraper] Checkpoint lost`)
      ACTIVE_JOBS.delete(checkpointId)
      return
    }

    const totalCategories = categories.length
    const videoCountAtStart = cache.vodIds.size

    await updateScraperCheckpoint(checkpointId, {
      ...checkpoint,
      totalCategories,
      videoCountAtStart,
      pagesPerCategory
    })

    console.log(`[Category Scraper] Starting with ${videoCountAtStart} videos cached`)

    const startCategoryIndex = checkpoint.lastCategoryIndex + 1
    const startPageForFirstCategory = checkpoint.lastPageCompleted + 1

    let totalScraped = checkpoint.totalVideosScraped
    let totalFailed = checkpoint.totalVideosFailed

    for (let categoryIndex = startCategoryIndex; categoryIndex < totalCategories; categoryIndex++) {
      const category = categories[categoryIndex]!
      const pageStart = categoryIndex === startCategoryIndex ? startPageForFirstCategory : 1

      console.log(`[Category Scraper] ${category.name} (${categoryIndex + 1}/${totalCategories})`)

      let consecutiveErrors = 0

      for (let page = pageStart; page <= pagesPerCategory; page++) {
        const result = await processPageWithCache(
          category.id,
          category.name,
          page,
          shouldTranslate,
          minViews,
          minDuration,
          cache
        )

        totalScraped += result.scraped
        totalFailed += result.errors

        // Update checkpoint with granular progress
        try {
          await updateScraperCheckpoint(checkpointId, {
            lastCategoryIndex: categoryIndex,
            lastPageCompleted: page,
            totalVideosScraped: totalScraped,
            totalVideosFailed: totalFailed,
            currentCategoryName: category.name,
            currentPage: page,
          })

          const job = ACTIVE_JOBS.get(checkpointId)
          if (job) job.lastUpdateTime = Date.now()
        } catch {
          // Continue anyway
        }

        if (result.scraped > 0 || result.duplicates > 0) {
          console.log(`[Category Scraper] ${category.name} p${page}: +${result.scraped} new, ${result.duplicates} dups`)
        }

        if (result.errors > 0) {
          consecutiveErrors++
          if (consecutiveErrors >= 3) {
            console.warn(`[Category Scraper] Skipping ${category.name} after 3 consecutive errors`)
            break
          }
        } else {
          consecutiveErrors = 0
        }

        if (!result.hasMore) break

        if (PAGE_DELAY_MS > 0) {
          await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS))
        }
      }

      if (CATEGORY_DELAY_MS > 0) {
        await new Promise(resolve => setTimeout(resolve, CATEGORY_DELAY_MS))
      }
    }

    // Flush all pending category updates
    await flushCategoryUpdates(cache)

    // Mark completed
    const videoCountFinal = await prisma.video.count()
    await updateScraperCheckpoint(checkpointId, {
      status: 'completed',
      videoCountCurrent: videoCountFinal
    })

    const newVideosAdded = videoCountFinal - videoCountAtStart
    console.log(`[Category Scraper] ✓ Completed: ${videoCountFinal} total (${newVideosAdded} new)`)

    ACTIVE_JOBS.delete(checkpointId)

  } catch (error) {
    console.error('[Category Scraper] Fatal error:', error)
    const checkpoint = await getScraperCheckpoint(checkpointId)
    if (checkpoint) {
      await updateScraperCheckpoint(checkpointId, { status: 'failed' })
    }
    ACTIVE_JOBS.delete(checkpointId)
  }
}

export async function POST(_request: NextRequest) {
  let checkpointId: string = ''

  try {
    const {
      pagesPerCategory = 5,
      resumeCheckpointId,
      categoryIds,
      categoryNames,
    } = await _request.json()

    console.log(`[Category Scraper] Started:`, {
      pagesPerCategory,
      resumeCheckpointId: resumeCheckpointId || 'new',
      filterType: categoryIds?.length ? 'IDs' : categoryNames?.length ? 'names' : 'all',
    })

    if (resumeCheckpointId) {
      checkpointId = resumeCheckpointId
      const checkpoint = await getScraperCheckpoint(checkpointId)
      if (!checkpoint) {
        return NextResponse.json(
          { success: false, message: 'Checkpoint not found' },
          { status: 404 }
        )
      }
      console.log(`[Category Scraper] Resuming from checkpoint ${checkpointId}`)
    } else {
      checkpointId = await createScraperCheckpoint()
      console.log(`[Category Scraper] Created checkpoint ${checkpointId}`)
    }

    // Start background scraping
    scrapeInBackground(checkpointId, pagesPerCategory, categoryIds, categoryNames)

    return NextResponse.json({
      success: true,
      checkpointId,
      message: resumeCheckpointId ? 'Resuming scraping' : 'Scraping started',
      async: true
    })

  } catch (error) {
    console.error('[Category Scraper] Fatal error:', error)

    if (checkpointId) {
      await updateScraperCheckpoint(checkpointId, { status: 'failed' })
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

  // Auto-recover stuck jobs
  const job = ACTIVE_JOBS.get(checkpointId)
  const timeSinceLastUpdate = job ? Date.now() - job.lastUpdateTime : Infinity

  if (checkpoint.status === 'running' && !job && timeSinceLastUpdate > 30000) {
    console.log(`[Auto-Recovery] Restarting stuck job ${checkpointId}`)
    scrapeInBackground(checkpointId, 5)
  }

  return NextResponse.json({
    success: true,
    checkpoint,
    cacheSize: job?.cache?.vodIds.size || 0,
    pendingUpdates: job?.cache?.pendingCategoryUpdates.size || 0,
    progress: {
      status: checkpoint.status,
      totalVideosScraped: checkpoint.totalVideosScraped,
      totalVideosFailed: checkpoint.totalVideosFailed,
      categoriesCompleted: checkpoint.lastCategoryIndex + 1,
      categoriesTotal: checkpoint.totalCategories || 165,
      // Granular progress
      currentCategoryName: checkpoint.currentCategoryName || null,
      currentPage: checkpoint.currentPage || 0,
      pagesPerCategory: checkpoint.pagesPerCategory || 0,
      startedAt: checkpoint.startedAt,
    },
  })
}
