import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

/**
 * Extract domain from a full referrer URL
 */
function extractDomainFromReferrer(referrer: string | null): string | null {
  if (!referrer) return null

  try {
    const url = new URL(referrer)
    let domain = url.hostname

    // Remove www. prefix
    if (domain.startsWith('www.')) {
      domain = domain.substring(4)
    }

    return domain
  } catch {
    return null
  }
}

// GET /api/admin/domains/logs - Get request logs grouped by domain
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get recent logs with referer field (limit to last 10000 for performance)
    const allLogs = await prisma.apiRequestLog.findMany({
      select: {
        id: true,
        referer: true,
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

    // Group by extracted domain
    const domainMap = new Map<string, { count: number; blocked: number; allowed: number; lastSeen: Date }>()

    allLogs.forEach((log) => {
      const domain = extractDomainFromReferrer(log.referer) || 'Direct/Unknown'

      if (!domainMap.has(domain)) {
        domainMap.set(domain, { count: 0, blocked: 0, allowed: 0, lastSeen: new Date(0) })
      }

      const stats = domainMap.get(domain)!
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
      .map(([domain, stats]) => ({
        domain,
        requests: stats.count,
        blocked: stats.blocked,
        allowed: stats.allowed,
        lastSeen: stats.lastSeen
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 100)

    return NextResponse.json({ logs: enrichedLogs })
  } catch (error) {
    console.error('[API] Error fetching logs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    )
  }
}
