import { getServerSession } from 'next-auth/next'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

interface BrowserData {
  browser: string
  count: number
  percentage: string
}

interface DeviceData {
  device: string
  count: number
  percentage: string
}

interface OSData {
  os: string
  count: number
  percentage: string
}

function parseUserAgent(userAgent: string | null): { browser: string; device: string; os: string } {
  if (!userAgent) {
    return { browser: 'Unknown', device: 'Unknown', os: 'Unknown' }
  }

  let browser = 'Unknown'
  let device = 'Mobile'
  let os = 'Unknown'

  // Detect browser
  if (userAgent.includes('Chrome')) browser = 'Chrome'
  else if (userAgent.includes('Safari')) browser = 'Safari'
  else if (userAgent.includes('Firefox')) browser = 'Firefox'
  else if (userAgent.includes('Edge')) browser = 'Edge'
  else if (userAgent.includes('Opera')) browser = 'Opera'

  // Detect device
  if (userAgent.includes('Mobile') || userAgent.includes('Android')) device = 'Mobile'
  else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) device = 'Tablet'
  else device = 'Desktop'

  // Detect OS
  if (userAgent.includes('Windows')) os = 'Windows'
  else if (userAgent.includes('Mac')) os = 'macOS'
  else if (userAgent.includes('Linux')) os = 'Linux'
  else if (userAgent.includes('Android')) os = 'Android'
  else if (userAgent.includes('iOS')) os = 'iOS'

  return { browser, device, os }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    })

    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if embed exists
    const embed = await prisma.videoEmbed.findUnique({ where: { id } })
    if (!embed) {
      return NextResponse.json({ error: 'Embed not found' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const eventType = searchParams.get('type') // 'impression' or 'click'
    const days = parseInt(searchParams.get('days') || '7')
    const domain = searchParams.get('domain')

    // Build where clause
    const dateFrom = new Date()
    dateFrom.setDate(dateFrom.getDate() - days)

    const where = {
      embedId: id,
      timestamp: { gte: dateFrom },
      ...(eventType && { eventType }),
      ...(domain && { referrerDomain: domain }),
    }

    // Get all analytics for the period
    const analytics = await prisma.embedAnalytics.findMany({
      where,
      orderBy: { timestamp: 'asc' },
    })

    // Calculate stats
    const impressions = analytics.filter(a => a.eventType === 'impression').length
    const clicks = analytics.filter(a => a.eventType === 'click').length
    const ctr = impressions > 0 ? (clicks / impressions * 100) : 0

    // Domain breakdown
    const domainBreakdown: Record<string, number> = {}
    analytics.forEach(a => {
      const domain = a.referrerDomain || 'direct'
      domainBreakdown[domain] = (domainBreakdown[domain] || 0) + 1
    })

    // Browser, Device, and OS breakdown
    const browserMap = new Map<string, number>()
    const deviceMap = new Map<string, number>()
    const osMap = new Map<string, number>()

    analytics.forEach(a => {
      const { browser, device, os } = parseUserAgent(a.userAgent)
      browserMap.set(browser, (browserMap.get(browser) || 0) + 1)
      deviceMap.set(device, (deviceMap.get(device) || 0) + 1)
      osMap.set(os, (osMap.get(os) || 0) + 1)
    })

    const total = analytics.length || 1

    const browsers: BrowserData[] = Array.from(browserMap.entries())
      .map(([browser, count]) => ({
        browser,
        count,
        percentage: ((count / total) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)

    const devices: DeviceData[] = Array.from(deviceMap.entries())
      .map(([device, count]) => ({
        device,
        count,
        percentage: ((count / total) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)

    const operatingSystems: OSData[] = Array.from(osMap.entries())
      .map(([os, count]) => ({
        os,
        count,
        percentage: ((count / total) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)

    // Daily stats
    const dailyStats: Record<string, { impressions: number; clicks: number }> = {}
    analytics.forEach(a => {
      const date = a.timestamp.toISOString().split('T')[0]
      if (!dailyStats[date]) {
        dailyStats[date] = { impressions: 0, clicks: 0 }
      }
      if (a.eventType === 'impression') {
        dailyStats[date].impressions++
      } else if (a.eventType === 'click') {
        dailyStats[date].clicks++
      }
    })

    // Chart data for timeline
    const chartData = Object.entries(dailyStats).map(([date, data]) => ({
      date,
      count: data.impressions + data.clicks
    }))

    return NextResponse.json({
      embedId: id,
      embed: {
        title: embed.title,
        displayName: embed.displayName,
        videoId: embed.videoId,
        preview: embed.preview,
        previewVideo: embed.previewVideo,
        redirectUrl: embed.redirectUrl,
      },
      impressions,
      clicks,
      ctr: Math.round(ctr * 100) / 100,
      domainBreakdown,
      browsers,
      devices,
      operatingSystems,
      dailyStats,
      chartData,
      period: { from: dateFrom.toISOString(), to: new Date().toISOString(), days },
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
