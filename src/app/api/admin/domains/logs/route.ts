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

    // Get recent logs with pre-extracted domain (limit to last 10000 for performance)
    const allLogs = await prisma.apiRequestLog.findMany({
      select: {
        id: true,
        domain: true,
        ipSessionHash: true,
        blocked: true,
        timestamp: true
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 10000
    })

    if (!allLogs || allLogs.length === 0) {
      return NextResponse.json({ logs: [] })
    }

    // Group by pre-extracted domain and IP session hash for Direct/Unknown
    const domainMap = new Map<string, { count: number; blocked: number; allowed: number; lastSeen: Date; ipSessionHash?: string | null }>()

    allLogs.forEach((log) => {
      // For requests with a domain, use domain as key
      // For Direct/Unknown (no domain), group by ipSessionHash if available
      let key: string
      let ipSessionHash: string | null | undefined

      if (log.domain) {
        key = log.domain
      } else {
        // For direct/unknown requests, create a composite key with ipSessionHash
        key = `Direct/Unknown${log.ipSessionHash ? '#' + log.ipSessionHash : ''}`
        ipSessionHash = log.ipSessionHash
      }

      if (!domainMap.has(key)) {
        domainMap.set(key, { count: 0, blocked: 0, allowed: 0, lastSeen: new Date(0), ipSessionHash })
      }

      const stats = domainMap.get(key)!
      stats.count++
      if (log.blocked) {
        stats.blocked++
      } else {
        stats.allowed++
      }
      if (log.timestamp > stats.lastSeen) {
        stats.lastSeen = log.timestamp
      }
    })

    // Convert to array and sort by count descending
    const enrichedLogs = Array.from(domainMap.entries())
      .map(([key, stats]) => {
        // Extract domain and ipSessionHash from key
        const isDirect = key.startsWith('Direct/Unknown')
        const parts = key.split('#')
        const domain = isDirect ? null : key
        const ipSessionHash = parts.length > 1 ? parts[1] : stats.ipSessionHash

        return {
          domain: domain || 'Direct/Unknown',
          requests: stats.count,
          blocked: stats.blocked,
          allowed: stats.allowed,
          lastSeen: stats.lastSeen,
          ipSessionHash: ipSessionHash
        }
      })
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 100)

    return NextResponse.json({ logs: enrichedLogs }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    })
  } catch (error) {

    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    )
  }
}
