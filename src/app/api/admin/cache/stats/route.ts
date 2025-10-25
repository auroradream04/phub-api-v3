import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getCacheStats } from '@/lib/cache-stats'
import { prisma } from '@/lib/prisma'

export const revalidate = 0 // Don't cache this endpoint

export async function GET() {
  try {
    // Check authentication - admin only
    const session = await getServerSession(authOptions)

    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      )
    }

    // Get in-memory cache stats
    const cacheStats = getCacheStats()

    // Get recent cache logs from database
    const recentLogs = await prisma.cacheLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 20
    })

    // Calculate cache log statistics
    const logStats = {
      totalLogs: await prisma.cacheLog.count(),
      last24Hours: await prisma.cacheLog.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      }),
      byAction: await prisma.cacheLog.groupBy({
        by: ['action'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } }
      })
    }

    return NextResponse.json({
      success: true,
      inMemoryStats: cacheStats,
      databaseStats: logStats,
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        action: log.action,
        target: log.target,
        videoId: log.videoId,
        success: log.success,
        timestamp: log.timestamp
      })),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Cache Stats] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch cache stats',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
