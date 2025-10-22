import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

// GET /api/admin/domains/logs - Get request logs grouped by domain
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get logs grouped by domain with counts
    const logs = await prisma.apiRequestLog.groupBy({
      by: ['domain'],
      _count: {
        id: true
      },
      _max: {
        timestamp: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 100
    })

    // For each domain, get blocked and allowed counts
    const enrichedLogs = await Promise.all(
      logs.map(async (log) => {
        const [blocked, allowed] = await Promise.all([
          prisma.apiRequestLog.count({
            where: {
              domain: log.domain,
              blocked: true
            }
          }),
          prisma.apiRequestLog.count({
            where: {
              domain: log.domain,
              blocked: false
            }
          })
        ])

        return {
          domain: log.domain,
          requests: log._count.id,
          blocked,
          allowed,
          lastSeen: log._max.timestamp || new Date()
        }
      })
    )

    return NextResponse.json({ logs: enrichedLogs })
  } catch (error) {
    console.error('[API] Error fetching logs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    )
  }
}
