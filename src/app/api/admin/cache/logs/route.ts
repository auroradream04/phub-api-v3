import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export const revalidate = 0 // Don't cache this endpoint

export async function GET(request: NextRequest) {
  try {
    // Check authentication - admin only
    const session = await getServerSession(authOptions)

    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      )
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const action = searchParams.get('action')
    const videoId = searchParams.get('videoId')

    // Build where clause
    const where: { action?: string | null; videoId?: string | null } = {}
    if (action) where.action = action
    if (videoId) where.videoId = videoId

    // Fetch logs with filters
    const logs = await prisma.cacheLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: Math.min(limit, 500) // Max 500 to prevent abuse
    })

    // Get action breakdown
    const actionBreakdown = await prisma.cacheLog.groupBy({
      by: ['action'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    })

    return NextResponse.json({
      success: true,
      count: logs.length,
      totalCount: await prisma.cacheLog.count(where ? { where } : {}),
      actionBreakdown: actionBreakdown.map((a) => ({
        action: a.action,
        count: a._count.id
      })),
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        target: log.target,
        videoId: log.videoId,
        success: log.success,
        reason: log.reason,
        timestamp: log.timestamp
      })),
      filters: {
        action,
        videoId,
        limit
      }
    })
  } catch (error) {
    console.error('[Cache Logs] Error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch cache logs',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
