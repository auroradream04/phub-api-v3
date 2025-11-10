import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { translateBatchEfficient, isChinese } from '@/lib/translate'

export const revalidate = 0 // No caching for translation endpoint

/**
 * POST /api/admin/translate-videos
 *
 * Bulk translate video titles to Chinese.
 * Translates videos that:
 * 1. Have needsTranslation=true (failed before, retrying, or never attempted)
 * 2. Have non-Chinese titles that haven't been translated yet
 *
 * Query params:
 * - limit: Number of videos to translate (default: ALL videos needing translation)
 *   Example: ?limit=100 to translate only 100 videos at a time
 * - maxRetries: Skip videos that have been retried this many times (default: 5)
 *
 * Returns: Streaming response with real-time progress updates
 */
export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams

  // Get total count of videos needing translation
  const totalNeedingTranslation = await prisma.video.count({
    where: { needsTranslation: true }
  })

  // Default to ALL videos needing translation, but allow override via query param
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam) : totalNeedingTranslation
  const maxRetries = parseInt(searchParams.get('maxRetries') || '5')

  console.log(`[Admin Translation] Starting bulk translation for up to ${limit} videos out of ${totalNeedingTranslation} needing translation (max retries: ${maxRetries})`)

  // Create a readable stream that we'll write progress to
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Helper to send progress update
        const sendProgress = (data: Record<string, unknown>) => {
          const text = JSON.stringify(data) + '\n'
          controller.enqueue(encoder.encode(text))
        }

        // Find videos that need translation (needsTranslation = true)
        // These are videos that either:
        // 1. Failed translation before
        // 2. Haven't been attempted yet (from old scrapes without translation)
        const videosToTranslate = await prisma.video.findMany({
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
            needsTranslation: true,
            translationRetryCount: true
          },
          take: limit,
          orderBy: {
            translationFailedAt: 'asc' // Process oldest failures first
          }
        })

        // Verify each video: check if vodName is already Chinese using isChinese()
        // If it is, mark it as done immediately
        const alreadyChinese: typeof videosToTranslate = []
        const toProcess: typeof videosToTranslate = []

        for (const video of videosToTranslate) {
          if (isChinese(video.vodName)) {
            alreadyChinese.push(video)
            console.log(`[Admin Translation] Already verified Chinese: ${video.vodId} - "${video.vodName.substring(0, 50)}"`)
          } else {
            toProcess.push(video)
          }
        }

        // Mark already-Chinese videos as done
        for (const video of alreadyChinese) {
          await prisma.video.update({
            where: { id: video.id },
            data: {
              needsTranslation: false,
              translationFailedAt: null,
              translationRetryCount: 0
            }
          })
          console.log(`[Admin Translation] Already Chinese: ${video.vodId}`)
        }

        if (toProcess.length === 0) {
          sendProgress({
            processed: alreadyChinese.length,
            total: alreadyChinese.length,
            completed: true,
            summary: {
              totalProcessed: alreadyChinese.length,
              successCount: alreadyChinese.length,
              failedCount: 0,
              message: alreadyChinese.length > 0
                ? `All videos already Chinese or translated. Marked ${alreadyChinese.length} as done.`
                : 'No videos need translation'
            }
          })
          controller.close()
          return
        }

        let successCount = 0
        let failCount = 0
        const startTime = Date.now()

        console.log(`[Admin Translation] Found ${toProcess.length} videos to translate, ${alreadyChinese.length} already Chinese`)
        sendProgress({
          processed: alreadyChinese.length,
          total: toProcess.length + alreadyChinese.length,
          completed: false,
          message: `Starting translation of ${toProcess.length} videos... (${alreadyChinese.length} already Chinese)`,
          stats: {
            elapsedSeconds: 0,
            videosPerMinute: 0,
            estimatedMinutesRemaining: toProcess.length > 0 ? Math.ceil(toProcess.length / 300) : 0,
            successCount: 0,
            failCount: 0
          }
        })

        // Process videos in chunks of 100 with real-time progress updates
        const CHUNK_SIZE = 100
        for (let chunkStart = 0; chunkStart < toProcess.length; chunkStart += CHUNK_SIZE) {
          const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, toProcess.length)
          const chunk = toProcess.slice(chunkStart, chunkEnd)

          // Get titles for this chunk
          const titlesToTranslate = chunk.map(v => v.originalTitle || v.vodName)

          // Translate chunk efficiently (100 titles in 1 API request with newlines)
          const translationResults = await translateBatchEfficient(titlesToTranslate)

          // Process results and update database
          for (let i = 0; i < chunk.length; i++) {
            const video = chunk[i]!
            const originalTitle = video.originalTitle || video.vodName
            const result = translationResults[i]!

            try {
              if (result.success && isChinese(result.text)) {
                // Translation succeeded AND result is actually Chinese - update video
                await prisma.video.update({
                  where: { id: video.id },
                  data: {
                    vodName: result.text,
                    originalTitle: originalTitle,
                    needsTranslation: false,
                    translationFailedAt: null,
                    translationRetryCount: 0 // Reset on success
                  }
                })

                successCount++
                console.log(`[Admin Translation] ✓ Success [${alreadyChinese.length + successCount + failCount}/${toProcess.length + alreadyChinese.length}]: ${video.vodId}`)

                sendProgress({
                  processed: alreadyChinese.length + successCount + failCount,
                  total: toProcess.length + alreadyChinese.length,
                  completed: false,
                  current: {
                    id: video.id,
                    vodId: video.vodId,
                    originalTitle: originalTitle,
                    translated: result.text,
                    success: true,
                    message: `"${originalTitle.substring(0, 40)}..." → "${result.text.substring(0, 40)}..."`
                  },
                  stats: (() => {
                    const elapsedMs = Date.now() - startTime
                    const elapsedSecs = Math.floor(elapsedMs / 1000)
                    const processed = successCount + failCount
                    const remaining = toProcess.length - processed
                    const videosPerMin = processed > 0 ? Math.round((processed * 60000) / elapsedMs) : 0
                    const estimatedMinutes = videosPerMin > 0 ? Math.ceil(remaining / videosPerMin) : 0
                    const calculatedFailCount = processed - successCount
                    return { elapsedSeconds: elapsedSecs, videosPerMinute: videosPerMin, estimatedMinutesRemaining: Math.max(0, estimatedMinutes), successCount, failCount: calculatedFailCount }
                  })()
                })
              } else {
                // Translation failed OR result is not Chinese - keep needsTranslation true, increment retry count
                const failureReason = result.success && !isChinese(result.text)
                  ? 'Translation did not return Chinese text'
                  : 'Translation API failed'

                await prisma.video.update({
                  where: { id: video.id },
                  data: {
                    originalTitle: originalTitle,
                    needsTranslation: true,
                    translationRetryCount: {
                      increment: 1
                    },
                    translationFailedAt: new Date()
                  }
                })

                failCount++
                console.log(`[Admin Translation] ✗ Failed [${alreadyChinese.length + successCount + failCount}/${toProcess.length + alreadyChinese.length}]: ${video.vodId} (${failureReason}, total failed: ${video.translationRetryCount + 1})`)

                sendProgress({
                  processed: alreadyChinese.length + successCount + failCount,
                  total: toProcess.length + alreadyChinese.length,
                  completed: false,
                  current: {
                    id: video.id,
                    vodId: video.vodId,
                    originalTitle: originalTitle,
                    translated: null,
                    success: false,
                    message: result.success && !isChinese(result.text)
                      ? `Translation did not return Chinese: "${result.text.substring(0, 40)}..."`
                      : `Failed to translate "${originalTitle.substring(0, 40)}..."`,
                    retryCount: video.translationRetryCount + 1
                  },
                  stats: (() => {
                    const elapsedMs = Date.now() - startTime
                    const elapsedSecs = Math.floor(elapsedMs / 1000)
                    const processed = successCount + failCount
                    const remaining = toProcess.length - processed
                    const videosPerMin = processed > 0 ? Math.round((processed * 60000) / elapsedMs) : 0
                    const estimatedMinutes = videosPerMin > 0 ? Math.ceil(remaining / videosPerMin) : 0
                    const calculatedFailCount = processed - successCount
                    return { elapsedSeconds: elapsedSecs, videosPerMinute: videosPerMin, estimatedMinutesRemaining: Math.max(0, estimatedMinutes), successCount, failCount: calculatedFailCount }
                  })()
                })
              }
            } catch (error) {
              failCount++
              const errorMsg = error instanceof Error ? error.message : 'Unknown error'
              console.error(`[Admin Translation] Database error for ${video.vodId}:`, error)

              sendProgress({
                processed: alreadyChinese.length + successCount + failCount,
                total: toProcess.length + alreadyChinese.length,
                completed: false,
                current: {
                  id: video.id,
                  vodId: video.vodId,
                  originalTitle: originalTitle,
                  translated: null,
                  success: false,
                  message: `Error: ${errorMsg}`
                },
                stats: (() => {
                  const elapsedMs = Date.now() - startTime
                  const elapsedSecs = Math.floor(elapsedMs / 1000)
                  const processed = successCount + failCount
                  const remaining = toProcess.length - processed
                  const videosPerMin = processed > 0 ? Math.round((processed * 60000) / elapsedMs) : 0
                  const estimatedMinutes = videosPerMin > 0 ? Math.ceil((remaining * 60) / videosPerMin) : 0
                  return { elapsedSeconds: elapsedSecs, videosPerMinute: videosPerMin, estimatedMinutesRemaining: Math.max(0, estimatedMinutes) }
                })()
              })
            }
          }
        }

        // Send final summary
        const totalProcessed = toProcess.length + alreadyChinese.length
        console.log(`[Admin Translation] Complete: ${successCount} total successes (${alreadyChinese.length} already Chinese + ${successCount - alreadyChinese.length} translated), ${failCount} failed`)
        sendProgress({
          processed: totalProcessed,
          total: totalProcessed,
          completed: true,
          summary: {
            totalProcessed,
            successCount,
            failedCount: failCount,
            message: `Translation complete: ${successCount} total done (${alreadyChinese.length} already Chinese, ${successCount - alreadyChinese.length} newly translated), ${failCount} failed`
          }
        })

        controller.close()
      } catch (error) {
        console.error('[Admin Translation] Stream error:', error)
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        controller.enqueue(
          JSON.stringify({
            completed: true,
            error: true,
            message: errorMsg
          }) + '\n'
        )
        controller.close()
      }
    }
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}

/**
 * GET /api/admin/translate-videos
 *
 * Get statistics about videos that need translation
 */
export async function GET() {
  try {
    // Efficient database query instead of loading all videos
    const needsTranslationCount = await prisma.video.count({
      where: { needsTranslation: true }
    })

    const totalVideos = await prisma.video.count()

    // Count by retry attempts
    const failedByRetry = await prisma.video.groupBy({
      by: ['translationRetryCount'],
      where: { needsTranslation: true },
      _count: true,
      orderBy: {
        translationRetryCount: 'asc'
      }
    })

    return NextResponse.json({
      success: true,
      stats: {
        totalNonChineseTitles: needsTranslationCount,
        needsTranslation: needsTranslationCount,
        totalVideos,
        failedByRetry: failedByRetry.map(item => ({
          retries: item.translationRetryCount,
          count: item._count
        }))
      }
    })
  } catch (error) {
    console.error('[Admin Translation] Error getting stats:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to get translation statistics'
    }, { status: 500 })
  }
}
