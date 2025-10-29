import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isTranslationEnabled, translateBatch } from '@/lib/translate'
import { parseViews, parseDuration, mergeCategories } from '@/lib/scraper-utils'

export const revalidate = 7200 // 2 hours

// Type definitions for scraped video data
interface ScrapedVideo {
  id: string
  views?: string
  duration: string
  title: string
  preview?: string
  provider?: string | { username?: string; name?: string }
  categories?: Array<{ id: number; name: string } | string>
}

// Helper to normalize provider
function normalizeProvider(provider: unknown): string {
  if (!provider) return ''
  if (typeof provider === 'string') return provider
  if (typeof provider === 'object' && provider !== null) {
    const obj = provider as Record<string, unknown>
    return (obj.username as string) || (obj.name as string) || ''
  }
  return ''
}

// Map custom category string IDs to numeric IDs for database storage
const CUSTOM_CATEGORY_IDS: Record<string, number> = {
  'japanese': 9999,
  'chinese': 9998
}

// Helper to strip emojis and special unicode characters
function stripEmojis(str: string): string {
  // Remove emojis and other problematic unicode characters
  return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/gu, '')
    .trim()
}

// parseDuration is now imported from scraper-utils

export async function POST(request: NextRequest) {
  try {
    const { page = 1, categoryId, categoryName } = await request.json()
    console.log(`[Scraper Videos] Processing: categoryId=${categoryId}, categoryName=${categoryName}, page=${page}`)

    const baseUrl = process.env.NEXTAUTH_URL || 'http://md8av.com'

    // Fetch scraper filter settings from database
    const minViewsSetting = await prisma.siteSetting.findUnique({
      where: { key: 'scraper_min_views' }
    })
    const minDurationSetting = await prisma.siteSetting.findUnique({
      where: { key: 'scraper_min_duration' }
    })

    const minViews = minViewsSetting ? parseInt(minViewsSetting.value) : 0
    const minDuration = minDurationSetting ? parseInt(minDurationSetting.value) : 0

    // Check if translation is enabled
    const shouldTranslate = await isTranslationEnabled()

    // If categoryId is provided, scrape from specific category
    // If not, scrape from general homepage
    let apiUrl: string
    let currentCategory: { id: number; name: string } | null = null

    if (categoryId) {
      apiUrl = `${baseUrl}/api/videos/category/${categoryId}?page=${page}`

      // Convert custom category string IDs to numeric IDs for database storage
      const numericId = typeof categoryId === 'string' && CUSTOM_CATEGORY_IDS[categoryId.toLowerCase()]
        ? CUSTOM_CATEGORY_IDS[categoryId.toLowerCase()]!
        : (typeof categoryId === 'number' ? categoryId : parseInt(categoryId, 10))

      currentCategory = { id: numericId, name: categoryName || 'Unknown' }

    } else {
      apiUrl = `${baseUrl}/api/home?page=${page}`

    }

    console.log(`[Scraper Videos] Fetching from: ${apiUrl}`)
    const response = await fetch(apiUrl)
    console.log(`[Scraper Videos] Got response, status: ${response.status}`)

    if (!response.ok) {
      throw new Error(`Failed to fetch videos: ${response.statusText}`)
    }

    const data = await response.json()
    console.log(`[Scraper Videos] Parsed JSON, got ${data.data?.length || 0} videos`)

    // Handle both /api/home and /api/videos/category response formats
    const videos = data.data || []
    const hasMore = data.paging ? !data.paging.isEnd : (data.paging?.pages?.next !== null)

    // If scraping by category, use the category info from response
    if (categoryId && data.category) {
      currentCategory = data.category
    }

    if (videos.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No videos found',
        scraped: 0,
        page,
        category: currentCategory,
      }, { status: 200 })
    }

    let scrapedCount = 0
    let errorCount = 0
    let skippedCount = 0

    // Phase 1: Filter videos and prepare data
    const videosToProcess: Array<{
      video: ScrapedVideo
      views: number
      durationSeconds: number
      cleanTitle: string
      publishDate: Date
      year: string
    }> = []

    for (const video of videos) {
      // Parse views with validation (handles "2.6K", "1.2M", "2,600", etc.)
      const views = parseViews(video.views || '0')

      // Parse duration with validation (handles "MM:SS", "HH:MM:SS", invalid formats)
      const durationSeconds = parseDuration(video.duration)

      // Apply filters: skip if video doesn't meet minimum requirements
      if (minViews > 0 && views < minViews) {
        skippedCount++
        continue
      }

      if (minDuration > 0 && durationSeconds < minDuration) {
        skippedCount++
        continue
      }

      const publishDate = new Date()
      const year = publishDate.getFullYear().toString()

      // Clean title to remove emojis
      const cleanTitle = stripEmojis(video.title)

      videosToProcess.push({
        video,
        views,
        durationSeconds,
        cleanTitle,
        publishDate,
        year
      })
    }

    // Phase 2: Batch translate all titles if enabled
    let translationResults: Array<{ text: string; success: boolean; wasCached: boolean }> = []
    if (shouldTranslate && videosToProcess.length > 0) {
      const titlesToTranslate = videosToProcess.map(v => v.cleanTitle)
      translationResults = await translateBatch(titlesToTranslate)
    }

    // Phase 3: Save to database
    for (let i = 0; i < videosToProcess.length; i++) {
      const item = videosToProcess[i]!
      const translationResult = shouldTranslate ? translationResults[i]! : null
      const finalTitle = translationResult ? translationResult.text : item.cleanTitle
      const translationFailed = translationResult ? !translationResult.success : false

      try {

        // Determine category to use
        let typeId: number
        let typeName: string

        if (currentCategory) {
          // Use the category we're scraping from
          typeId = currentCategory.id
          typeName = currentCategory.name
        } else if (item.video.categories && item.video.categories.length > 0) {
          // Use the first category from video metadata (if available from API)
          const firstCat = item.video.categories[0]
          typeId = typeof firstCat === 'object' ? firstCat.id : 1
          typeName = typeof firstCat === 'object' ? firstCat.name : firstCat
        } else {
          // Fallback to a default category
          typeId = 1
          typeName = 'Amateur'
        }

        // Atomic transaction for safe category merging with validation
        await prisma.$transaction(async (tx) => {
          // Read existing video with lock (for category merging)
          const existing = await tx.video.findUnique({
            where: { vodId: item.video.id },
            select: { vodClass: true },
          })

          // Safe category merging with length validation
          const vodClass = mergeCategories(existing?.vodClass, typeName)

          const vodEn = finalTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 50)

          // Atomic upsert
          await tx.video.upsert({
            where: { vodId: item.video.id },
            update: {
              vodName: finalTitle,
              originalTitle: shouldTranslate ? item.cleanTitle : undefined,
              typeId,
              typeName,
              vodPic: item.video.preview,
              vodTime: item.publishDate,
              duration: item.durationSeconds,
              vodRemarks: `HD ${item.video.duration}`,
              views: item.views,
              vodClass,
              vodYear: item.year,
              vodLang: 'zh',
              vodArea: 'CN',
              // Translation tracking
              needsTranslation: translationFailed,
              translationFailedAt: translationFailed ? new Date() : null,
              translationRetryCount: translationFailed ? 0 : undefined, // Reset on new failure
            },
            create: {
              vodId: item.video.id,
              vodName: finalTitle,
              originalTitle: shouldTranslate ? item.cleanTitle : undefined,
              typeId,
              typeName,
              vodClass: typeName,
              vodEn,
              vodTime: item.publishDate,
              vodRemarks: `HD ${item.video.duration}`,
              vodPlayFrom: 'dplayer',
              vodPic: item.video.preview,
              vodArea: 'CN',
              vodLang: 'zh',
              vodYear: item.year,
              vodActor: normalizeProvider(item.video.provider) || '',
              vodDirector: '',
              vodContent: finalTitle,
              vodPlayUrl: `HD$${baseUrl}/api/watch/${item.video.id}/stream.m3u8?q=720`,
              vodProvider: normalizeProvider(item.video.provider),
              views: item.views,
              duration: item.durationSeconds,
              // Translation tracking
              needsTranslation: translationFailed,
              translationFailedAt: translationFailed ? new Date() : null,
              translationRetryCount: 0,
            },
          })
        })

        scrapedCount++

      } catch (error) {
        console.error(`[Scraper Videos] Failed to save video ${item.video.id}:`, error instanceof Error ? error.message : error)
        errorCount++
      }
    }

    const filterSummary = skippedCount > 0
      ? ` (${skippedCount} filtered)`
      : ''

    return NextResponse.json({
      success: true,
      message: currentCategory
        ? `Scraped ${scrapedCount} videos from ${currentCategory.name} - page ${page}${filterSummary}`
        : `Scraped ${scrapedCount} videos from homepage - page ${page}${filterSummary}`,
      scraped: scrapedCount,
      errors: errorCount,
      skipped: skippedCount,
      filters: {
        minViews: minViews,
        minDuration: minDuration,
      },
      page,
      hasMore,
      category: currentCategory,
      totalVideos: await prisma.video.count(),
    }, { status: 200 })

  } catch (error) {

    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      scraped: 0,
    }, { status: 500 })
  }
}

// GET endpoint to check scraper status
export async function GET() {
  try {
    const totalVideos = await prisma.video.count()
    const videosByCategory = await prisma.video.groupBy({
      by: ['typeId', 'typeName'],
      _count: true,
    })

    return NextResponse.json({
      totalVideos,
      categories: videosByCategory.sort((a, b) => a.typeId - b.typeId),
    })
  } catch (error) {

    return NextResponse.json({
      success: false,
      message: 'Failed to get scraper status',
    }, { status: 500 })
  }
}

// DELETE endpoint to clear all videos
export async function DELETE() {
  try {
    const deleted = await prisma.video.deleteMany({})
    return NextResponse.json({
      success: true,
      message: `Deleted ${deleted.count} videos`,
      deleted: deleted.count,
    })
  } catch (error) {

    return NextResponse.json({
      success: false,
      message: 'Failed to delete videos',
    }, { status: 500 })
  }
}
