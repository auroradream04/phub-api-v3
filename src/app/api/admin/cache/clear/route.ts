import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag, revalidatePath } from 'next/cache'
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
      revalidatePath(`/api/video/${videoId}`)
      revalidatePath(`/watch/${videoId}`)
      target = `video-${videoId}`
      cleared = `video-${videoId}`
      trackCacheClear(`video-${videoId}`)

    } else {
      // Clear all cache - both tags and paths
      revalidateTag('videos')

      // Clear homepage and API routes
      revalidatePath('/', 'page') // Homepage
      revalidatePath('/api/home', 'page') // Home API
      revalidatePath('/api/search/[query]', 'page') // Search API
      revalidatePath('/api/videos', 'page') // Videos API

      target = 'all'
      cleared = 'all videos'
      trackCacheClear('all')

      console.log('[Cache Clear] Cleared all paths: /, /api/home, /api/search, /api/videos')
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
