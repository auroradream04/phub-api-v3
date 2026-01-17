import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getProxyStats, clearProxyHealth, reloadProxyList } from '@/lib/proxy'

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

    const stats = getProxyStats()

    // Sort proxies by success rate (worst first) for easy troubleshooting
    const sortedProxies = [...stats.proxies].sort((a, b) => a.successRate - b.successRate)

    return NextResponse.json({
      success: true,
      summary: {
        total: stats.total,
        healthy: stats.healthy,
        inCooldown: stats.inCooldown,
        healthyPercentage: stats.total > 0 ? Math.round((stats.healthy / stats.total) * 100) : 0,
      },
      proxies: sortedProxies.map(p => ({
        ...p,
        successRate: Math.round(p.successRate * 100), // Convert to percentage
      })),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch proxy stats',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    // Check authentication - admin only
    const session = await getServerSession(authOptions)

    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { action } = body

    switch (action) {
      case 'clear-health':
        clearProxyHealth()
        return NextResponse.json({
          success: true,
          message: 'Proxy health data cleared. All cooldowns reset.',
        })

      case 'reload-list':
        reloadProxyList()
        const stats = getProxyStats()
        return NextResponse.json({
          success: true,
          message: `Proxy list reloaded. ${stats.total} proxies loaded.`,
          total: stats.total,
        })

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to perform action',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
