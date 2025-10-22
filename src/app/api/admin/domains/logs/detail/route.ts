import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

// GET /api/admin/domains/logs/detail - Get detailed request logs for a specific domain
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const domainParam = searchParams.get('domain')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!domainParam) {
      return NextResponse.json({ error: 'Domain parameter required' }, { status: 400 })
    }

    const skip = (page - 1) * limit

    // Get logs filtered by pre-extracted domain using database query
    const allLogs = await prisma.apiRequestLog.findMany({
      where: {
        domain: domainParam
      },
      orderBy: { timestamp: 'desc' },
      take: 10000,
      select: {
        id: true,
        endpoint: true,
        method: true,
        statusCode: true,
        responseTime: true,
        ipAddress: true,
        userAgent: true,
        referer: true,
        country: true,
        blocked: true,
        timestamp: true
      }
    })

    // All logs are already filtered by domain from database
    const filteredLogs = allLogs

    // Apply pagination
    const totalCount = filteredLogs.length
    const paginatedLogs = filteredLogs.slice(skip, skip + limit)

    // Map logs for response
    const logs = paginatedLogs.map((log) => ({
      id: log.id,
      endpoint: log.endpoint,
      method: log.method,
      statusCode: log.statusCode,
      responseTime: log.responseTime,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      referer: log.referer,
      country: log.country,
      blocked: log.blocked,
      timestamp: log.timestamp
    }))

    return NextResponse.json({
      logs,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit)
      }
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    })
  } catch (error) {
    console.error('[API] Error fetching detailed logs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch detailed logs' },
      { status: 500 }
    )
  }
}
