import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { translateBatch } from '@/lib/translate'

export const revalidate = 0 // No caching for retry endpoint

/**
 * POST /api/scraper/retry-translations
 *
 * Retry translations for videos that failed translation previously.
 * Queries videos with needsTranslation=true and attempts to translate them again.
 *
 * Query params:
 * - limit: Number of videos to retry (default: 100)
 * - maxRetries: Skip videos that have been retried this many times (default: 5)
 */
export async function POST(_request: NextRequest) {
  try {
    const searchParams = _request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '100')
    const maxRetries = parseInt(searchParams.get('maxRetries') || '5')

    console.log(`[Retry Translations] Starting retry for up to ${limit} videos (max retries: ${maxRetries})`)

    // Find videos that need translation and haven't exceeded retry limit
    const videosToRetry = await prisma.video.findMany({
      where: {
        needsTranslation: true,
        translationRetryCount: {
          lt: maxRetries
        }
      },
      select: {
        id: true,
        vodId: true,
        vodName: true,
        originalTitle: true,
        translationRetryCount: true
      },
      take: limit,
      orderBy: {
        translationFailedAt: 'asc' // Oldest failures first
      }
    })

    if (videosToRetry.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No videos need translation retry',
        retried: 0,
        successful: 0,
        failed: 0
      })
    }

    console.log(`[Retry Translations] Found ${videosToRetry.length} videos to retry`)

    // Batch translate all titles
    const titlesToTranslate = videosToRetry.map(v => v.originalTitle || v.vodName)
    const translationResults = await translateBatch(titlesToTranslate)

    let successCount = 0
    let failCount = 0

    // Update each video based on translation result
    for (let i = 0; i < videosToRetry.length; i++) {
      const video = videosToRetry[i]!
      const result = translationResults[i]!

      try {
        if (result.success) {
          // Translation succeeded - update video and clear flag
          await prisma.video.update({
            where: { id: video.id },
            data: {
              vodName: result.text,
              needsTranslation: false,
              translationFailedAt: null,
              // Keep retry count for historical tracking
            }
          })
          successCount++
          console.log(`[Retry Translations] ✓ Success: ${video.vodId}`)
        } else {
          // Translation failed again - increment retry count
          await prisma.video.update({
            where: { id: video.id },
            data: {
              translationRetryCount: {
                increment: 1
              },
              translationFailedAt: new Date()
            }
          })
          failCount++
          console.log(`[Retry Translations] ✗ Failed: ${video.vodId} (retry ${video.translationRetryCount + 1}/${maxRetries})`)
        }
      } catch (error) {
        console.error(`[Retry Translations] Database error for ${video.vodId}:`, error)
        failCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Retry complete: ${successCount} succeeded, ${failCount} failed`,
      retried: videosToRetry.length,
      successful: successCount,
      failed: failCount
    })

  } catch (error) {
    console.error('[Retry Translations] Error:', error)
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      retried: 0,
      successful: 0,
      failed: 0
    }, { status: 500 })
  }
}

/**
 * GET /api/scraper/retry-translations
 *
 * Get statistics about videos needing translation retry
 */
export async function GET() {
  try {
    const needsRetry = await prisma.video.count({
      where: { needsTranslation: true }
    })

    const byRetryCount = await prisma.video.groupBy({
      by: ['translationRetryCount'],
      where: { needsTranslation: true },
      _count: true,
      orderBy: {
        translationRetryCount: 'asc'
      }
    })

    return NextResponse.json({
      success: true,
      total: needsRetry,
      byRetryCount: byRetryCount.map(item => ({
        retries: item.translationRetryCount,
        count: item._count
      }))
    })

  } catch (error) {
    console.error('[Retry Translations] Error getting stats:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to get retry statistics'
    }, { status: 500 })
  }
}
