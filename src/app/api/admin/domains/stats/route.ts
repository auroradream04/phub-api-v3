import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

// GET /api/admin/domains/stats - Get domain usage statistics
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = _request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '30')

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get total requests in time period
    const totalRequests = await prisma.apiRequestLog.count({
      where: { timestamp: { gte: startDate } }
    })

    // Get blocked vs allowed requests
    const [blockedRequests, allowedRequests] = await Promise.all([
      prisma.apiRequestLog.count({
        where: {
          timestamp: { gte: startDate },
          blocked: true
        }
      }),
      prisma.apiRequestLog.count({
        where: {
          timestamp: { gte: startDate },
          blocked: false
        }
      })
    ])

    // Get top domains by request count
    const topDomains = await prisma.apiRequestLog.groupBy({
      by: ['domain'],
      where: {
        timestamp: { gte: startDate },
        domain: { not: null }
      },
      _count: { domain: true },
      orderBy: { _count: { domain: 'desc' } },
      take: 10
    })

    // Get requests by endpoint
    const requestsByEndpoint = await prisma.apiRequestLog.groupBy({
      by: ['endpoint'],
      where: { timestamp: { gte: startDate } },
      _count: { endpoint: true },
      orderBy: { _count: { endpoint: 'desc' } },
      take: 10
    })

    // Get time series data (requests per day)
    const timeSeriesData = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as count
      FROM ApiRequestLog
      WHERE timestamp >= ${startDate}
      GROUP BY DATE(timestamp)
      ORDER BY DATE(timestamp) ASC
    `

    // Get country distribution
    const countryStats = await prisma.apiRequestLog.groupBy({
      by: ['country'],
      where: {
        timestamp: { gte: startDate },
        country: { not: null }
      },
      _count: { country: true },
      orderBy: { _count: { country: 'desc' } },
      take: 10
    })

    return NextResponse.json({
      summary: {
        totalRequests,
        blockedRequests,
        allowedRequests,
        blockRate: totalRequests > 0 ? (blockedRequests / totalRequests * 100).toFixed(2) : 0
      },
      topDomains: topDomains.map(d => ({
        domain: d.domain,
        requests: d._count.domain
      })),
      requestsByEndpoint: requestsByEndpoint.map(e => ({
        endpoint: e.endpoint,
        requests: e._count.endpoint
      })),
      timeSeries: timeSeriesData.map(d => ({
        date: d.date,
        count: Number(d.count)
      })),
      countries: countryStats.map(c => ({
        country: c.country,
        requests: c._count.country
      }))
    })
  } catch {

    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    )
  }
}
