import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { trackCacheClear } from '@/lib/cache-stats'
import { prisma } from '@/lib/prisma'

export const revalidate = 0 // Don't cache this endpoint

export async function POST(request: NextRequest) {
  try {
    // Check authentication - admin only
    const session = await getServerSession(authOptions)

    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { videoId } = body as { videoId?: string }

    let cleared = 'all'
    let target = 'all'

    if (videoId && videoId.trim() !== '') {
      // Clear specific video cache
      revalidateTag(`video-${videoId}`)
      target = `video-${videoId}`
      cleared = `video-${videoId}`
      trackCacheClear(`video-${videoId}`)
      console.log(`[Cache] Cleared cache for video: ${videoId}`)
    } else {
      // Clear all video cache
      revalidateTag('videos')
      target = 'all'
      cleared = 'all videos'
      trackCacheClear('all')
      console.log('[Cache] Cleared cache for all videos')
    }

    // Log to database
    try {
      await prisma.cacheLog.create({
        data: {
          action: 'clear',
          target,
          videoId: videoId?.trim() || null,
          success: true,
          timestamp: new Date()
        }
      })
    } catch (dbError) {
      console.error('[Cache] Failed to log cache clear to database:', dbError)
      // Don't fail the whole request if logging fails
    }

    return NextResponse.json(
      {
        success: true,
        message: `Cache cleared for ${cleared}`,
        cleared,
        timestamp: new Date().toISOString()
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[Cache] Error clearing cache:', error)

    // Log failure to database
    try {
      await prisma.cacheLog.create({
        data: {
          action: 'clear',
          target: 'unknown',
          success: false,
          reason: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date()
        }
      })
    } catch (dbError) {
      console.error('[Cache] Failed to log cache error to database:', dbError)
    }

    return NextResponse.json(
      {
        error: 'Failed to clear cache',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
