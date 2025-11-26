/**
 * Keyword-based Search Scraper for Japanese and Chinese categories
 *
 * ULTRA-OPTIMIZED VERSION:
 * - In-memory cache of all vodIds and vodNames (loaded once at start)
 * - Zero DB lookups per page - only batch inserts
 * - Minimal delays since we use proxies
 * - Category updates batched at the very end
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PornHub } from '@/lib/pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { isTranslationEnabled, translateBatch } from '@/lib/translate'
import { parseViews, parseDuration, mergeCategories } from '@/lib/scraper-utils'
import { getCanonicalCategory } from '@/lib/category-mapping'

// Search terms for Japanese content
const JAPANESE_KEYWORDS = [
  'japanese', '日本', 'jav', 'japan', 'tokyo', '東京',
  'uncensored japanese', 'japanese amateur', 'japanese wife',
  'japanese milf', 'japanese teen', 'japanese massage',
  'japanese schoolgirl', 'japanese cosplay',
]

// Search terms for Chinese content
const CHINESE_KEYWORDS = [
  'chinese', '中文', '中国', 'china', 'taiwan', '台灣',
  'hong kong', '香港', 'chinese amateur', 'chinese wife',
  'chinese teen', 'madou', 'swag', '國產',
]

const CATEGORY_IDS = {
  japanese: 9999,
  chinese: 9998,
}

// Minimal delays - proxies handle rate limiting
const PAGE_DELAY_MS = 50
const KEYWORD_DELAY_MS = 100

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

interface ScrapedVideo {
  id: string
  views?: string
  duration: string
  title: string
  preview?: string
  provider?: string | { username?: string; name?: string }
}

// In-memory cache for a scraping job
interface VideoCache {
  vodIds: Map<string, string>  // vodId -> vodClass (for category merging)
  vodNames: Set<string>        // For deduplication
  pendingCategoryUpdates: Map<string, string>  // vodId -> newClass (batch update at end)
}

// Search with retry (minimal delays)
async function searchWithRetry(
  keyword: string,
  page: number,
  maxRetries = 3
): Promise<{ data: ScrapedVideo[]; paging?: { isEnd?: boolean; maxPage?: number } }> {
  let retries = maxRetries

  while (retries > 0) {
    const pornhub = new PornHub()
    const proxyInfo = getRandomProxy('Keyword Search')
    if (proxyInfo) {
      pornhub.setAgent(proxyInfo.agent)
    }

    try {
      const result = await pornhub.searchVideo(keyword, { page })

      if (!result.data || result.data.length === 0) {
        retries--
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }
      }

      return result as { data: ScrapedVideo[]; paging?: { isEnd?: boolean; maxPage?: number } }
    } catch (err) {
      retries--
      if (retries > 0) {
        console.warn(`[Keyword Search] Error for "${keyword}", retrying: ${err instanceof Error ? err.message : err}`)
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }
      throw err
    }
  }

  return { data: [] }
}

// Job tracking with cache
const ACTIVE_KEYWORD_JOBS = new Map<string, {
  category: string
  keywords: string[]
  currentKeywordIndex: number
  currentPage: number
  pagesPerKeyword: number
  totalScraped: number
  totalErrors: number
  totalDuplicates: number
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  lastUpdate: string
  cache: VideoCache | null
}>()

// Load entire database into memory cache (runs once per job)
async function loadVideoCache(): Promise<VideoCache> {
  console.log('[Keyword Search] Loading video cache from database...')
  const startTime = Date.now()

  // Single query to get all vodIds and their classes
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
  console.log(`[Keyword Search] Cache loaded: ${cache.vodIds.size} videos, ${cache.vodNames.size} names in ${elapsed}ms`)

  return cache
}

// Process a page using in-memory cache (ZERO db lookups!)
async function processPageWithCache(
  keyword: string,
  categoryId: number,
  categoryName: string,
  page: number,
  shouldTranslate: boolean,
  minViews: number,
  minDuration: number,
  cache: VideoCache
): Promise<{ scraped: number; errors: number; duplicates: number; hasMore: boolean }> {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://api.md8av.com'

  try {
    const result = await searchWithRetry(keyword, page)

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

    // Separate new vs existing using IN-MEMORY CACHE (no DB query!)
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
        // Video exists - queue category update for later
        const currentClass = cache.vodIds.get(video.vodId)!
        const mergedClass = mergeCategories(currentClass, canonicalCategory)
        if (mergedClass !== currentClass) {
          cache.pendingCategoryUpdates.set(video.vodId, mergedClass)
          // Update cache immediately so subsequent checks are accurate
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
        vodPic: video.preview,
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

    // Batch insert new videos (single query!)
    let createdCount = 0
    if (videosToCreate.length > 0) {
      try {
        const result = await prisma.video.createMany({
          data: videosToCreate,
          skipDuplicates: true,
        })
        createdCount = result.count
      } catch (err) {
        console.error(`[Keyword Search] Batch create failed:`, err)
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

    const hasMore = !result.paging?.isEnd && (result.paging?.maxPage ? page < result.paging.maxPage : true)

    return {
      scraped: createdCount,
      errors: videosToCreate.length - createdCount,
      duplicates: duplicateCount,
      hasMore
    }
  } catch (err) {
    console.error(`[Keyword Search] Error for "${keyword}" page ${page}:`, err)
    return { scraped: 0, errors: 1, duplicates: 0, hasMore: false }
  }
}

// Flush pending category updates to database (runs at end of job)
async function flushCategoryUpdates(cache: VideoCache): Promise<number> {
  if (cache.pendingCategoryUpdates.size === 0) return 0

  console.log(`[Keyword Search] Flushing ${cache.pendingCategoryUpdates.size} category updates...`)

  // Group by newClass for efficient batch updates
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
      // Batch update in chunks of 1000 to avoid query size limits
      for (let i = 0; i < vodIds.length; i += 1000) {
        const chunk = vodIds.slice(i, i + 1000)
        const result = await prisma.video.updateMany({
          where: { vodId: { in: chunk } },
          data: { vodClass: newClass }
        })
        totalUpdated += result.count
      }
    } catch (err) {
      console.error(`[Keyword Search] Category update failed:`, err)
    }
  }

  cache.pendingCategoryUpdates.clear()
  console.log(`[Keyword Search] Updated ${totalUpdated} video categories`)
  return totalUpdated
}

// Background scraping function
async function scrapeKeywordsInBackground(
  jobId: string,
  category: 'japanese' | 'chinese',
  pagesPerKeyword: number
) {
  const keywords = category === 'japanese' ? JAPANESE_KEYWORDS : CHINESE_KEYWORDS
  const categoryId = CATEGORY_IDS[category]

  const job = ACTIVE_KEYWORD_JOBS.get(jobId)
  if (!job) return

  try {
    // Load settings
    const minViewsSetting = await prisma.siteSetting.findUnique({ where: { key: 'scraper_min_views' } })
    const minDurationSetting = await prisma.siteSetting.findUnique({ where: { key: 'scraper_min_duration' } })
    const minViews = minViewsSetting ? parseInt(minViewsSetting.value) : 0
    const minDuration = minDurationSetting ? parseInt(minDurationSetting.value) : 0
    const shouldTranslate = await isTranslationEnabled()

    // Load entire database into memory (once!)
    job.cache = await loadVideoCache()

    for (let keywordIdx = job.currentKeywordIndex; keywordIdx < keywords.length; keywordIdx++) {
      const keyword = keywords[keywordIdx]!
      const startPage = keywordIdx === job.currentKeywordIndex ? job.currentPage : 1

      console.log(`[Keyword Search] "${keyword}" (${keywordIdx + 1}/${keywords.length})`)

      for (let page = startPage; page <= pagesPerKeyword; page++) {
        const result = await processPageWithCache(
          keyword,
          categoryId,
          category,
          page,
          shouldTranslate,
          minViews,
          minDuration,
          job.cache
        )

        job.currentKeywordIndex = keywordIdx
        job.currentPage = page
        job.totalScraped += result.scraped
        job.totalErrors += result.errors
        job.totalDuplicates += result.duplicates
        job.lastUpdate = new Date().toISOString()

        if (result.scraped > 0 || result.duplicates > 0) {
          console.log(`[Keyword Search] "${keyword}" p${page}: +${result.scraped} new, ${result.duplicates} dups`)
        }

        if (!result.hasMore) break

        // Minimal delay
        if (PAGE_DELAY_MS > 0) {
          await new Promise(resolve => setTimeout(resolve, PAGE_DELAY_MS))
        }
      }

      // Minimal delay between keywords
      if (KEYWORD_DELAY_MS > 0) {
        await new Promise(resolve => setTimeout(resolve, KEYWORD_DELAY_MS))
      }
    }

    // Flush all pending category updates at the end
    await flushCategoryUpdates(job.cache)

    job.status = 'completed'
    job.lastUpdate = new Date().toISOString()
    console.log(`[Keyword Search] ✓ Completed ${category}: ${job.totalScraped} new, ${job.totalDuplicates} dups, ${job.totalErrors} errors`)

  } catch (err) {
    console.error(`[Keyword Search] Fatal error:`, err)
    job.status = 'failed'
    job.lastUpdate = new Date().toISOString()
  }
}

// POST: Start keyword search scraping
export async function POST(request: NextRequest) {
  try {
    const { category, pagesPerKeyword = 5 } = await request.json()

    if (!category || (category !== 'japanese' && category !== 'chinese')) {
      return NextResponse.json(
        { success: false, message: 'Invalid category. Must be "japanese" or "chinese"' },
        { status: 400 }
      )
    }

    // Check if already running
    for (const [, job] of ACTIVE_KEYWORD_JOBS) {
      if (job.category === category && job.status === 'running') {
        return NextResponse.json(
          { success: false, message: `Keyword search for ${category} is already running` },
          { status: 409 }
        )
      }
    }

    const jobId = `keyword_${category}_${Date.now()}`
    const keywords = category === 'japanese' ? JAPANESE_KEYWORDS : CHINESE_KEYWORDS

    ACTIVE_KEYWORD_JOBS.set(jobId, {
      category,
      keywords,
      currentKeywordIndex: 0,
      currentPage: 1,
      pagesPerKeyword,
      totalScraped: 0,
      totalErrors: 0,
      totalDuplicates: 0,
      status: 'running',
      startedAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      cache: null,
    })

    scrapeKeywordsInBackground(jobId, category, pagesPerKeyword)

    return NextResponse.json({
      success: true,
      jobId,
      message: `Started keyword search for ${category} with ${keywords.length} keywords, ${pagesPerKeyword} pages each`,
      keywords,
    })

  } catch (err) {
    console.error('[Keyword Search] Error starting:', err)
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET: Check job status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')
  const category = searchParams.get('category')

  if (jobId) {
    const job = ACTIVE_KEYWORD_JOBS.get(jobId)
    if (!job) {
      return NextResponse.json({ success: false, message: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      job: {
        category: job.category,
        status: job.status,
        totalScraped: job.totalScraped,
        totalDuplicates: job.totalDuplicates,
        totalErrors: job.totalErrors,
        startedAt: job.startedAt,
        lastUpdate: job.lastUpdate,
        cacheSize: job.cache?.vodIds.size || 0,
        pendingUpdates: job.cache?.pendingCategoryUpdates.size || 0,
        progress: {
          currentKeyword: job.keywords[job.currentKeywordIndex] || 'completed',
          keywordsCompleted: job.currentKeywordIndex,
          totalKeywords: job.keywords.length,
          currentPage: job.currentPage,
          pagesPerKeyword: job.pagesPerKeyword,
        }
      }
    })
  }

  if (category) {
    for (const [id, job] of ACTIVE_KEYWORD_JOBS) {
      if (job.category === category) {
        return NextResponse.json({
          success: true,
          jobId: id,
          job: {
            category: job.category,
            status: job.status,
            totalScraped: job.totalScraped,
            totalDuplicates: job.totalDuplicates,
            totalErrors: job.totalErrors,
            startedAt: job.startedAt,
            lastUpdate: job.lastUpdate,
            cacheSize: job.cache?.vodIds.size || 0,
            progress: {
              currentKeyword: job.keywords[job.currentKeywordIndex] || 'completed',
              keywordsCompleted: job.currentKeywordIndex,
              totalKeywords: job.keywords.length,
              currentPage: job.currentPage,
              pagesPerKeyword: job.pagesPerKeyword,
            }
          }
        })
      }
    }
    return NextResponse.json({ success: true, job: null, message: 'No active job for this category' })
  }

  const jobs: Record<string, unknown> = {}
  for (const [id, job] of ACTIVE_KEYWORD_JOBS) {
    jobs[id] = {
      category: job.category,
      status: job.status,
      totalScraped: job.totalScraped,
      totalDuplicates: job.totalDuplicates,
      totalErrors: job.totalErrors,
      cacheSize: job.cache?.vodIds.size || 0,
      progress: {
        currentKeyword: job.keywords[job.currentKeywordIndex] || 'completed',
        keywordsCompleted: job.currentKeywordIndex,
        totalKeywords: job.keywords.length,
        currentPage: job.currentPage,
        pagesPerKeyword: job.pagesPerKeyword,
      }
    }
  }

  return NextResponse.json({ success: true, jobs })
}

// DELETE: Cancel a job
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')

  if (!jobId) {
    return NextResponse.json({ success: false, message: 'jobId required' }, { status: 400 })
  }

  const job = ACTIVE_KEYWORD_JOBS.get(jobId)
  if (!job) {
    return NextResponse.json({ success: false, message: 'Job not found' }, { status: 404 })
  }

  // Flush any pending updates before canceling
  if (job.cache) {
    await flushCategoryUpdates(job.cache)
  }

  job.status = 'completed'
  ACTIVE_KEYWORD_JOBS.delete(jobId)

  return NextResponse.json({ success: true, message: 'Job cancelled' })
}
