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

    // Parse domain parameter to handle Direct/Unknown with IP session hash
    interface WhereCondition {
      domain: string | null
      ipSessionHash?: string
    }

    let whereCondition: WhereCondition

    if (domainParam.startsWith('Direct/Unknown')) {
      // Extract IP session hash if present (format: "Direct/Unknown#hash")
      const parts = domainParam.split('#')
      if (parts.length > 1) {
        // Filter by ipSessionHash for specific direct/unknown session
        whereCondition = {
          domain: null,
          ipSessionHash: parts[1]
        }
      } else {
        // Filter by all null domain entries
        whereCondition = {
          domain: null
        }
      }
    } else {
      // Filter by domain name
      whereCondition = {
        domain: domainParam
      }
    }

    // Get logs filtered by pre-extracted domain using database query
    const allLogs = await prisma.apiRequestLog.findMany({
      where: whereCondition,
      orderBy: { timestamp: 'desc' },
      take: 10000,
      select: {
        id: true,
        domain: true,
        endpoint: true,
        method: true,
        statusCode: true,
        responseTime: true,
        ipAddress: true,
        userAgent: true,
        referer: true,
        hasReferrer: true,
        ipSessionHash: true,
        clientFingerprint: true,
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
      domain: log.domain || 'Direct/Unknown',
      endpoint: log.endpoint,
      method: log.method,
      statusCode: log.statusCode,
      responseTime: log.responseTime,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      referer: log.referer,
      hasReferrer: log.hasReferrer,
      ipSessionHash: log.ipSessionHash,
      clientFingerprint: log.clientFingerprint,
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
