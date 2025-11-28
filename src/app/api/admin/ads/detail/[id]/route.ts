import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || (session.user as { role?: string })?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const searchParams = request.nextUrl.searchParams
    const days = parseFloat(searchParams.get('days') || '7')

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()

    // Handle fractional days (for hours/minutes)
    if (days < 1) {
      startDate.setTime(startDate.getTime() - days * 24 * 60 * 60 * 1000)
    } else {
      startDate.setDate(startDate.getDate() - Math.floor(days))
    }

    // Get ad details with total count
    const ad = await prisma.ad.findUnique({
      where: { id },
      include: {
        _count: {
          select: { impressions: true }
        }
      }
    })

    if (!ad) {
      return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
    }

    // Count impressions in period (single count query)
    const impressionsInPeriod = await prisma.adImpression.count({
      where: {
        adId: id,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      }
    })

    // Get aggregated data using groupBy for sources (referrer)
    const sourceAggregation = await prisma.adImpression.groupBy({
      by: ['referrer'],
      where: {
        adId: id,
        timestamp: { gte: startDate, lte: endDate }
      },
      _count: { referrer: true },
      orderBy: { _count: { referrer: 'desc' } },
      take: 10
    })

    const topSources = sourceAggregation.map(item => ({
      source: extractDomain(item.referrer),
      count: item._count.referrer
    }))

    // Merge sources with same domain
    const mergedSources = new Map<string, number>()
    topSources.forEach(s => {
      mergedSources.set(s.source, (mergedSources.get(s.source) || 0) + s.count)
    })
    const finalTopSources = Array.from(mergedSources.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Get aggregated data for videos
    const videoAggregation = await prisma.adImpression.groupBy({
      by: ['videoId'],
      where: {
        adId: id,
        timestamp: { gte: startDate, lte: endDate }
      },
      _count: { videoId: true },
      orderBy: { _count: { videoId: 'desc' } },
      take: 10
    })

    const topVideos = videoAggregation.map(item => ({
      videoId: item.videoId,
      count: item._count.videoId
    }))

    // Get aggregated data for countries
    const countryAggregation = await prisma.adImpression.groupBy({
      by: ['country'],
      where: {
        adId: id,
        timestamp: { gte: startDate, lte: endDate }
      },
      _count: { country: true },
      orderBy: { _count: { country: 'desc' } },
      take: 10
    })

    const countries = countryAggregation.map(item => ({
      country: item.country || 'Unknown',
      count: item._count.country,
      percentage: impressionsInPeriod > 0
        ? ((item._count.country / impressionsInPeriod) * 100).toFixed(1)
        : '0'
    }))

    // For user agent analysis, we need to fetch the data (can't do regex in groupBy)
    // But we'll limit to a sample for performance
    const userAgentSample = await prisma.adImpression.findMany({
      where: {
        adId: id,
        timestamp: { gte: startDate, lte: endDate }
      },
      select: { userAgent: true },
      take: 10000 // Sample up to 10k for UA analysis
    })

    const browserMap = new Map<string, number>()
    const deviceMap = new Map<string, number>()
    const osMap = new Map<string, number>()

    userAgentSample.forEach(imp => {
      const ua = imp.userAgent || 'unknown'

      // Browser detection
      let browser = 'Other'
      if (ua.includes('Edg/') || ua.includes('Edge/')) browser = 'Microsoft Edge'
      else if (ua.includes('Chrome/') && !ua.includes('Edg')) browser = 'Chrome'
      else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari'
      else if (ua.includes('Firefox/')) browser = 'Firefox'
      else if (ua.includes('Opera/') || ua.includes('OPR/')) browser = 'Opera'
      browserMap.set(browser, (browserMap.get(browser) || 0) + 1)

      // Device type
      let device = 'Desktop'
      if (ua.includes('Mobile') || ua.includes('Android')) device = 'Mobile'
      else if (ua.includes('Tablet') || ua.includes('iPad')) device = 'Tablet'
      deviceMap.set(device, (deviceMap.get(device) || 0) + 1)

      // OS detection
      let os = 'Other'
      if (ua.includes('Windows')) os = 'Windows'
      else if (ua.includes('Mac OS')) os = 'macOS'
      else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux'
      else if (ua.includes('Android')) os = 'Android'
      else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
      osMap.set(os, (osMap.get(os) || 0) + 1)
    })

    const sampleSize = userAgentSample.length || 1

    const browsers = Array.from(browserMap.entries())
      .map(([browser, count]) => ({
        browser,
        count: Math.round((count / sampleSize) * impressionsInPeriod),
        percentage: ((count / sampleSize) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)

    const devices = Array.from(deviceMap.entries())
      .map(([device, count]) => ({
        device,
        count: Math.round((count / sampleSize) * impressionsInPeriod),
        percentage: ((count / sampleSize) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)

    const operatingSystems = Array.from(osMap.entries())
      .map(([os, count]) => ({
        os,
        count: Math.round((count / sampleSize) * impressionsInPeriod),
        percentage: ((count / sampleSize) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)

    // Chart data - fetch only timestamps (minimal payload) and aggregate in JS
    const timestamps = await prisma.adImpression.findMany({
      where: {
        adId: id,
        timestamp: { gte: startDate, lte: endDate }
      },
      select: { timestamp: true },
      orderBy: { timestamp: 'asc' }
    })

    const chartData: { date: string; count: number }[] = []

    if (days <= 1) {
      // Hourly aggregation
      const hourMap = new Map<string, number>()
      timestamps.forEach(({ timestamp }) => {
        const hourKey = timestamp.toISOString().slice(0, 13) // YYYY-MM-DDTHH
        hourMap.set(hourKey, (hourMap.get(hourKey) || 0) + 1)
      })

      // Fill in all hours
      const current = new Date(startDate)
      current.setMinutes(0, 0, 0)
      while (current <= endDate) {
        const hourKey = current.toISOString().slice(0, 13)
        chartData.push({
          date: current.toISOString(),
          count: hourMap.get(hourKey) || 0
        })
        current.setHours(current.getHours() + 1)
      }
    } else {
      // Daily aggregation
      const dayMap = new Map<string, number>()
      timestamps.forEach(({ timestamp }) => {
        const dayKey = timestamp.toISOString().split('T')[0] // YYYY-MM-DD
        dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + 1)
      })

      // Fill in all days
      const current = new Date(startDate)
      current.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(0, 0, 0, 0)

      while (current <= end) {
        const dayKey = current.toISOString().split('T')[0]
        chartData.push({
          date: dayKey,
          count: dayMap.get(dayKey) || 0
        })
        current.setDate(current.getDate() + 1)
      }
    }

    // Calculate growth (compare to previous period)
    const previousStart = new Date(startDate)
    const previousEnd = new Date(startDate)
    if (days < 1) {
      previousStart.setTime(previousStart.getTime() - days * 24 * 60 * 60 * 1000)
    } else {
      previousStart.setDate(previousStart.getDate() - Math.floor(days))
    }

    const previousPeriodCount = await prisma.adImpression.count({
      where: {
        adId: id,
        timestamp: {
          gte: previousStart,
          lt: previousEnd
        }
      }
    })

    let growth = '0'
    if (previousPeriodCount > 0) {
      const growthPercent = ((impressionsInPeriod - previousPeriodCount) / previousPeriodCount) * 100
      growth = growthPercent.toFixed(1)
    } else if (impressionsInPeriod > 0) {
      growth = '100'
    }

    return NextResponse.json({
      ad: {
        id: ad.id,
        title: ad.title,
        description: ad.description,
        status: ad.status,
        weight: ad.weight,
        forceDisplay: ad.forceDisplay,
        duration: ad.duration
      },
      stats: {
        totalImpressions: ad._count.impressions,
        impressionsInPeriod,
        growth
      },
      topSources: finalTopSources,
      topVideos,
      browsers,
      devices,
      operatingSystems,
      countries,
      chartData,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}

// Extract domain from referrer URL
function extractDomain(referrer: string | null): string {
  if (!referrer || referrer === 'direct') return 'Direct'

  try {
    const url = new URL(referrer)
    const hostname = url.hostname.replace('www.', '')

    // Common display names
    const displayNames: Record<string, string> = {
      'google.com': 'Google',
      'bing.com': 'Bing',
      'duckduckgo.com': 'DuckDuckGo',
      'yahoo.com': 'Yahoo',
      'facebook.com': 'Facebook',
      'twitter.com': 'Twitter',
      't.co': 'Twitter',
      'reddit.com': 'Reddit',
      'youtube.com': 'YouTube'
    }

    return displayNames[hostname] || hostname
  } catch {
    return referrer.slice(0, 30) || 'Unknown'
  }
}
