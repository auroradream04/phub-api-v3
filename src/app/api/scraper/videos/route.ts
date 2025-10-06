import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Category mapping - matches Maccms categories
const CATEGORIES = [
  { id: 1, name: 'Amateur' },
  { id: 2, name: 'Anal' },
  { id: 3, name: 'Asian' },
  { id: 4, name: 'BBW' },
  { id: 5, name: 'Big Ass' },
  { id: 6, name: 'Big Tits' },
  { id: 7, name: 'Blonde' },
  { id: 8, name: 'Blowjob' },
  { id: 9, name: 'Brunette' },
  { id: 10, name: 'Creampie' },
  { id: 11, name: 'Cumshot' },
  { id: 12, name: 'Ebony' },
  { id: 13, name: 'Hardcore' },
  { id: 14, name: 'Hentai' },
  { id: 15, name: 'Latina' },
  { id: 16, name: 'Lesbian' },
  { id: 17, name: 'MILF' },
  { id: 18, name: 'POV' },
  { id: 19, name: 'Teen' },
  { id: 20, name: 'Threesome' },
]

// Helper to map PornHub categories to our category IDs (unused but kept for future use)
// function mapCategory(phCategories: string[]): { id: number; name: string } {
//   // Try to find first matching category
//   for (const phCat of phCategories) {
//     const found = CATEGORIES.find(
//       (cat) => cat.name.toLowerCase() === phCat.toLowerCase()
//     )
//     if (found) return found
//   }

//   // Default to "Amateur" if no match
//   return CATEGORIES[0]!
// }

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
    const { page = 1 } = await request.json()

    console.log(`[Scraper] Fetching page ${page}`)

    // Fetch videos from our own /api/home endpoint
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:4444'
    const homeResponse = await fetch(`${baseUrl}/api/home?page=${page}`)

    if (!homeResponse.ok) {
      throw new Error(`Failed to fetch videos: ${homeResponse.statusText}`)
    }

    const homeData = await homeResponse.json()

    if (!homeData || !homeData.data || homeData.data.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No videos found',
        scraped: 0,
        page,
      }, { status: 200 })
    }

    let scrapedCount = 0
    let errorCount = 0

    // Process ALL videos from the page (no need to fetch individual details)
    for (let i = 0; i < homeData.data.length; i++) {
      const video = homeData.data[i]

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

        // Assign category based on position (rotate through all 20 categories)
        const categoryIndex = i % CATEGORIES.length
        const category = CATEGORIES[categoryIndex]!

        const durationSeconds = parseDuration(video.duration)
        const publishDate = new Date()
        const year = publishDate.getFullYear().toString()

        // Upsert video to database
        await prisma.video.upsert({
          where: {
            vodId: video.id,
          },
          update: {
            vodName: video.title,
            vodPic: video.preview,
            vodTime: publishDate,
            duration: durationSeconds,
            vodRemarks: `HD ${video.duration}`,
            views: views,
            typeId: category.id,
            typeName: category.name,
            vodYear: year,
          },
          create: {
            vodId: video.id,
            vodName: video.title,
            typeId: category.id,
            typeName: category.name,
            vodEn: video.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
              .substring(0, 50),
            vodTime: publishDate,
            vodRemarks: `HD ${video.duration}`,
            vodPlayFrom: 'YourAPI',
            vodPic: video.preview,
            vodArea: 'US',
            vodLang: 'en',
            vodYear: year,
            vodActor: video.provider || '',
            vodDirector: '',
            vodContent: video.title,
            vodPlayUrl: `Full Video$${baseUrl}/api/watch/${video.id}/stream?q=720`,
            views: views,
            duration: durationSeconds,
          },
        })

        scrapedCount++
        console.log(`[Scraper] ✓ Saved: ${video.id} - ${video.title} [${category.name}]`)
      } catch (error) {
        errorCount++
        console.error(`[Scraper] ✗ Failed to save video ${video.id}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Scraped ${scrapedCount} videos from page ${page}`,
      scraped: scrapedCount,
      errors: errorCount,
      page,
      hasMore: !homeData.paging?.isEnd,
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
