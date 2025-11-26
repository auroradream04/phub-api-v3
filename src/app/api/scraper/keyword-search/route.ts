/**
 * Keyword-based Search Scraper for Japanese and Chinese categories
 *
 * Uses multiple search terms to maximize video discovery for these specific categories.
 * Each keyword is searched and results are assigned to the appropriate category.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PornHub } from '@/lib/pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { isTranslationEnabled, translateBatch } from '@/lib/translate'
import { parseViews, parseDuration, mergeCategories } from '@/lib/scraper-utils'
import { getCanonicalCategory } from '@/lib/category-mapping'

// Search terms for Japanese content - varied to maximize results
const JAPANESE_KEYWORDS = [
  'japanese',
  '日本',
  'jav',
  'japan',
  'tokyo',
  '東京',
  'uncensored japanese',
  'japanese amateur',
  'japanese wife',
  'japanese milf',
  'japanese teen',
  'japanese massage',
  'japanese schoolgirl',
  'japanese cosplay',
]

// Search terms for Chinese content
const CHINESE_KEYWORDS = [
  'chinese',
  '中文',
  '中国',
  'china',
  'taiwan',
  '台灣',
  'hong kong',
  '香港',
  'chinese amateur',
  'chinese wife',
  'chinese teen',
  'madou',
  'swag',
  '國產',
]

// Category IDs
const CATEGORY_IDS = {
  japanese: 9999,
  chinese: 9998,
}

// Helper to strip emojis
function stripEmojis(str: string): string {
  return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F100}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/gu, '')
    .trim()
}

// Normalize provider
function normalizeProvider(provider: unknown): string {
  if (!provider) return ''
  if (typeof provider === 'string') return provider
  if (typeof provider === 'object' && provider !== null) {
    const obj = provider as Record<string, unknown>
    return (obj.username as string) || (obj.name as string) || ''
  }
  return ''
}

// Deduplicate video name
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deduplicateVideoName(baseName: string, tx: any): Promise<string> {
  const existingWithBaseName = await tx.video.findFirst({
    where: { vodName: baseName },
    select: { id: true },
  })

  if (!existingWithBaseName) {
    return baseName
  }

  for (let suffix = 2; suffix <= 1000; suffix++) {
    const candidateName = `${baseName} (${suffix})`
    const existingWithSuffix = await tx.video.findFirst({
      where: { vodName: candidateName },
      select: { id: true },
    })
    if (!existingWithSuffix) {
      return candidateName
    }
  }

  return `${baseName} (${Math.random().toString(36).substring(7)})`
}

// Type for scraped video
interface ScrapedVideo {
  id: string
  views?: string
  duration: string
  title: string
  preview?: string
  provider?: string | { username?: string; name?: string }
}

// Search with retry logic
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
          console.warn(`[Keyword Search] Empty data for "${keyword}" page ${page}, retrying...`)
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
      }

      return result as { data: ScrapedVideo[]; paging?: { isEnd?: boolean; maxPage?: number } }
    } catch (err) {
      retries--
      if (retries > 0) {
        console.warn(`[Keyword Search] Error for "${keyword}", retrying: ${err instanceof Error ? err.message : err}`)
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }
      throw err
    }
  }

  return { data: [] }
}

// Store progress in memory (since this runs in background)
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
}>()

// Process a single keyword search batch
async function processKeywordBatch(
  keyword: string,
  categoryId: number,
  categoryName: string,
  page: number,
  shouldTranslate: boolean,
  minViews: number,
  minDuration: number
): Promise<{ scraped: number; errors: number; duplicates: number; hasMore: boolean }> {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://api.md8av.com'

  try {
    const result = await searchWithRetry(keyword, page)

    if (!result.data || result.data.length === 0) {
      return { scraped: 0, errors: 0, duplicates: 0, hasMore: false }
    }

    let scraped = 0
    let errors = 0
    let duplicates = 0

    // Filter videos
    const videosToProcess: Array<{
      video: ScrapedVideo
      views: number
      durationSeconds: number
      cleanTitle: string
      cleanDuration: string
      cleanProvider: string
      publishDate: Date
      year: string
    }> = []

    for (const video of result.data) {
      const views = parseViews(video.views || '0')
      const durationSeconds = parseDuration(video.duration)

      if (minViews > 0 && views < minViews) continue
      if (minDuration > 0 && durationSeconds < minDuration) continue

      const publishDate = new Date()
      const year = publishDate.getFullYear().toString()

      videosToProcess.push({
        video,
        views,
        durationSeconds,
        cleanTitle: stripEmojis(video.title),
        cleanDuration: stripEmojis(video.duration),
        cleanProvider: stripEmojis(normalizeProvider(video.provider)),
        publishDate,
        year
      })
    }

    // Batch translate if enabled
    let translationResults: Array<{ text: string; success: boolean; wasCached: boolean }> = []
    if (shouldTranslate && videosToProcess.length > 0) {
      const titlesToTranslate = videosToProcess.map(v => v.cleanTitle)
      translationResults = await translateBatch(titlesToTranslate)
    }

    // Save to database
    const canonicalCategory = getCanonicalCategory(categoryName)

    for (let i = 0; i < videosToProcess.length; i++) {
      const item = videosToProcess[i]!
      const translationResult = shouldTranslate ? translationResults[i]! : null
      const finalTitle = translationResult ? translationResult.text : item.cleanTitle
      const translationFailed = translationResult ? !translationResult.success : false

      try {
        // Check if video already exists
        const existing = await prisma.video.findUnique({
          where: { vodId: item.video.id },
          select: { id: true, vodClass: true }
        })

        if (existing) {
          // Update categories only
          const updatedClass = mergeCategories(existing.vodClass, canonicalCategory)
          await prisma.video.update({
            where: { vodId: item.video.id },
            data: { vodClass: updatedClass }
          })
          duplicates++
          continue
        }

        // New video - insert
        await prisma.$transaction(async (tx) => {
          const deduplicatedName = await deduplicateVideoName(finalTitle, tx)
          const vodEn = deduplicatedName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 50)

          await tx.video.create({
            data: {
              vodId: item.video.id,
              vodName: deduplicatedName,
              originalTitle: shouldTranslate ? item.cleanTitle : undefined,
              typeId: categoryId,
              typeName: canonicalCategory,
              vodClass: canonicalCategory,
              vodEn,
              vodTime: item.publishDate,
              vodRemarks: `HD ${item.cleanDuration}`,
              vodPlayFrom: 'dplayer',
              vodPic: item.video.preview,
              vodArea: 'CN',
              vodLang: 'zh',
              vodYear: item.year,
              vodActor: item.cleanProvider,
              vodDirector: '',
              vodContent: deduplicatedName,
              vodPlayUrl: `HD$${baseUrl}/api/watch/${item.video.id}/stream.m3u8?q=720`,
              vodProvider: item.cleanProvider,
              views: item.views,
              duration: item.durationSeconds,
              needsTranslation: translationFailed,
              translationFailedAt: translationFailed ? new Date() : null,
              translationRetryCount: 0,
            }
          })
        })

        scraped++
      } catch (err) {
        console.error(`[Keyword Search] Failed to save video ${item.video.id}:`, err)
        errors++
      }
    }

    const hasMore = !result.paging?.isEnd && (result.paging?.maxPage ? page < result.paging.maxPage : true)

    return { scraped, errors, duplicates, hasMore }
  } catch (err) {
    console.error(`[Keyword Search] Batch error for "${keyword}" page ${page}:`, err)
    return { scraped: 0, errors: 1, duplicates: 0, hasMore: false }
  }
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
    // Get settings
    const minViewsSetting = await prisma.siteSetting.findUnique({ where: { key: 'scraper_min_views' } })
    const minDurationSetting = await prisma.siteSetting.findUnique({ where: { key: 'scraper_min_duration' } })
    const minViews = minViewsSetting ? parseInt(minViewsSetting.value) : 0
    const minDuration = minDurationSetting ? parseInt(minDurationSetting.value) : 0
    const shouldTranslate = await isTranslationEnabled()

    for (let keywordIdx = job.currentKeywordIndex; keywordIdx < keywords.length; keywordIdx++) {
      const keyword = keywords[keywordIdx]!
      const startPage = keywordIdx === job.currentKeywordIndex ? job.currentPage : 1

      console.log(`[Keyword Search] Processing "${keyword}" (${keywordIdx + 1}/${keywords.length})`)

      for (let page = startPage; page <= pagesPerKeyword; page++) {
        const result = await processKeywordBatch(
          keyword,
          categoryId,
          category,
          page,
          shouldTranslate,
          minViews,
          minDuration
        )

        // Update job progress
        job.currentKeywordIndex = keywordIdx
        job.currentPage = page
        job.totalScraped += result.scraped
        job.totalErrors += result.errors
        job.totalDuplicates += result.duplicates
        job.lastUpdate = new Date().toISOString()

        console.log(`[Keyword Search] "${keyword}" page ${page}: +${result.scraped} new, ${result.duplicates} dups`)

        if (!result.hasMore) {
          console.log(`[Keyword Search] No more results for "${keyword}" at page ${page}`)
          break
        }

        // Delay between pages
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // Delay between keywords
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    job.status = 'completed'
    job.lastUpdate = new Date().toISOString()
    console.log(`[Keyword Search] Completed ${category}: ${job.totalScraped} new videos, ${job.totalDuplicates} duplicates, ${job.totalErrors} errors`)

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

    // Check if already running for this category
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
    })

    // Start background scraping
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

  // If jobId provided, return specific job
  if (jobId) {
    const job = ACTIVE_KEYWORD_JOBS.get(jobId)
    if (!job) {
      return NextResponse.json({ success: false, message: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      job: {
        ...job,
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

  // If category provided, find active job for that category
  if (category) {
    for (const [id, job] of ACTIVE_KEYWORD_JOBS) {
      if (job.category === category) {
        return NextResponse.json({
          success: true,
          jobId: id,
          job: {
            ...job,
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

  // Return all jobs
  const jobs: Record<string, unknown> = {}
  for (const [id, job] of ACTIVE_KEYWORD_JOBS) {
    jobs[id] = {
      ...job,
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

  job.status = 'completed' // Mark as completed to stop processing
  ACTIVE_KEYWORD_JOBS.delete(jobId)

  return NextResponse.json({ success: true, message: 'Job cancelled' })
}
