import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

// GET /api/admin/domains/logs/detail - Get detailed request logs for a specific domain
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || (session.user as any).role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const domain = searchParams.get('domain')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!domain) {
      return NextResponse.json({ error: 'Domain parameter required' }, { status: 400 })
    }

    const skip = (page - 1) * limit

    // Get total count for pagination
    const totalCount = await prisma.apiRequestLog.count({
      where: { domain }
    })

    // Get detailed logs for this domain
    const logs = await prisma.apiRequestLog.findMany({
      where: { domain },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip,
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

    return NextResponse.json({
      logs,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit)
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
