import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const revalidate = 7200 // 2 hours

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

// Helper to format duration from "MM:SS" to seconds
function parseDuration(duration: string): number {
  const parts = duration.split(':').map(Number)
  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]! // MM:SS
  }
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]! // HH:MM:SS
  }
  return 0
}

export async function POST(request: NextRequest) {
  try {
    const { page = 1, categoryId, categoryName } = await request.json()

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:4444'

    // Fetch scraper filter settings from database
    const minViewsSetting = await prisma.siteSetting.findUnique({
      where: { key: 'scraper_min_views' }
    })
    const minDurationSetting = await prisma.siteSetting.findUnique({
      where: { key: 'scraper_min_duration' }
    })

    const minViews = minViewsSetting ? parseInt(minViewsSetting.value) : 0
    const minDuration = minDurationSetting ? parseInt(minDurationSetting.value) : 0

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
      console.log(`[Scraper] Fetching ${categoryName} (ID: ${categoryId}) - page ${page}`)
    } else {
      apiUrl = `${baseUrl}/api/home?page=${page}`
      console.log(`[Scraper] Fetching homepage - page ${page}`)
    }

    const response = await fetch(apiUrl)

    if (!response.ok) {
      throw new Error(`Failed to fetch videos: ${response.statusText}`)
    }

    const data = await response.json()

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

    // Process ALL videos from the page
    for (const video of videos) {
      try {
        // Parse views (e.g., "2.6K" -> 2600, "1.2M" -> 1200000)
        const viewsStr = video.views || '0'
        let views = 0
        if (viewsStr.includes('K')) {
          views = Math.floor(parseFloat(viewsStr.replace('K', '')) * 1000)
        } else if (viewsStr.includes('M')) {
          views = Math.floor(parseFloat(viewsStr.replace('M', '')) * 1000000)
        } else {
          views = parseInt(viewsStr.replace(/,/g, '')) || 0
        }

        const durationSeconds = parseDuration(video.duration)

        // Apply filters: skip if video doesn't meet minimum requirements
        if (minViews > 0 && views < minViews) {
          skippedCount++
          console.log(`[Scraper] ⊘ Skipped: ${video.id} - ${video.title} (views: ${views} < ${minViews})`)
          continue
        }

        if (minDuration > 0 && durationSeconds < minDuration) {
          skippedCount++
          console.log(`[Scraper] ⊘ Skipped: ${video.id} - ${video.title} (duration: ${durationSeconds}s < ${minDuration}s)`)
          continue
        }
        const publishDate = new Date()
        const year = publishDate.getFullYear().toString()

        // Clean title to remove emojis
        const cleanTitle = stripEmojis(video.title)

        // Determine category to use
        let typeId: number
        let typeName: string

        if (currentCategory) {
          // Use the category we're scraping from
          typeId = currentCategory.id
          typeName = currentCategory.name
        } else if (video.categories && video.categories.length > 0) {
          // Use the first category from video metadata (if available from API)
          const firstCat = video.categories[0]
          typeId = typeof firstCat === 'object' ? firstCat.id : 1
          typeName = typeof firstCat === 'object' ? firstCat.name : firstCat
        } else {
          // Fallback to a default category
          typeId = 1
          typeName = 'Amateur'
        }

        // Check if video exists to merge categories
        const existingVideo = await prisma.video.findUnique({
          where: { vodId: video.id },
          select: { vodClass: true, typeId: true, typeName: true },
        })

        let vodClass: string
        if (existingVideo) {
          // Merge categories
          const existingCategories = existingVideo.vodClass
            ? existingVideo.vodClass.split(',').map(c => c.trim())
            : [existingVideo.typeName]

          // Add new category if not already present
          if (!existingCategories.includes(typeName)) {
            existingCategories.push(typeName)
          }

          vodClass = existingCategories.join(',')
        } else {
          // New video - use current category
          vodClass = typeName
        }

        // Upsert video to database
        await prisma.video.upsert({
          where: {
            vodId: video.id,
          },
          update: {
            vodName: cleanTitle,
            vodPic: video.preview,
            vodTime: publishDate,
            duration: durationSeconds,
            vodRemarks: `HD ${video.duration}`,
            views: views,
            vodClass: vodClass,
            vodYear: year,
          },
          create: {
            vodId: video.id,
            vodName: cleanTitle,
            typeId: typeId,
            typeName: typeName,
            vodClass: vodClass,
            vodEn: cleanTitle
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
              .substring(0, 50),
            vodTime: publishDate,
            vodRemarks: `HD ${video.duration}`,
            vodPlayFrom: 'dplayer',
            vodPic: video.preview,
            vodArea: 'US',
            vodLang: 'en',
            vodYear: year,
            vodActor: video.provider || '',
            vodDirector: '',
            vodContent: cleanTitle,
            vodPlayUrl: `Full Video$${baseUrl}/api/watch/${video.id}/stream.m3u8?q=720`,
            views: views,
            duration: durationSeconds,
          },
        })

        scrapedCount++
        console.log(`[Scraper] ✓ Saved: ${video.id} - ${cleanTitle} [${typeName}]`)
      } catch (error) {
        errorCount++
        console.error(`[Scraper] ✗ Failed to save video ${video.id}:`, error)
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
    console.error('[Scraper] Error:', error)
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
    console.error('[Scraper] Error:', error)
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
    console.error('[Scraper] Error:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to delete videos',
    }, { status: 500 })
  }
}
