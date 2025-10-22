import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getDomainDisplayName } from '@/lib/extract-domain'

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
    const days = parseInt(searchParams.get('days') || '7')

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get ad details
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

    // Get impressions in date range
    const impressions = await prisma.adImpression.findMany({
      where: {
        adId: id,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        referrer: true,
        userAgent: true,
        country: true,
        videoId: true,
        timestamp: true
      }
    })

    // Calculate total impressions (all time)
    const totalImpressions = ad._count.impressions

    // Calculate impressions in period
    const impressionsInPeriod = impressions.length

    // Group by domain extracted from referrer for top sources
    const sourceMap = new Map<string, number>()
    impressions.forEach(imp => {
      const domain = getDomainDisplayName(imp.referrer)
      sourceMap.set(domain, (sourceMap.get(domain) || 0) + 1)
    })

    const topSources = Array.from(sourceMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Group by video for top pages
    const videoMap = new Map<string, number>()
    impressions.forEach(imp => {
      videoMap.set(imp.videoId, (videoMap.get(imp.videoId) || 0) + 1)
    })

    const topVideos = Array.from(videoMap.entries())
      .map(([videoId, count]) => ({ videoId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Group by user agent for devices/browsers
    const browserMap = new Map<string, number>()
    const deviceMap = new Map<string, number>()
    const osMap = new Map<string, number>()

    impressions.forEach(imp => {
      const ua = imp.userAgent || 'unknown'

      // Browser detection (order matters - check Edge before Chrome!)
      let browser = 'Other'
      if (ua.includes('Edg/') || ua.includes('Edge/')) browser = 'Microsoft Edge'
      else if (ua.includes('Chrome/') && !ua.includes('Edg')) browser = 'Chrome'
      else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari'
      else if (ua.includes('Firefox/')) browser = 'Firefox'
      else if (ua.includes('Opera/') || ua.includes('OPR/')) browser = 'Opera'

      browserMap.set(browser, (browserMap.get(browser) || 0) + 1)

      // Device type detection
      let device = 'Desktop'
      if (ua.includes('Mobile') || ua.includes('Android')) device = 'Mobile'
      else if (ua.includes('Tablet') || ua.includes('iPad')) device = 'Tablet'

      deviceMap.set(device, (deviceMap.get(device) || 0) + 1)

      // OS detection
      let os = 'Other'
      if (ua.includes('Windows')) os = 'Windows'
      else if (ua.includes('Mac OS')) os = 'macOS'
      else if (ua.includes('Linux')) os = 'Linux'
      else if (ua.includes('Android')) os = 'Android'
      else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'

      osMap.set(os, (osMap.get(os) || 0) + 1)
    })

    const browsers = Array.from(browserMap.entries())
      .map(([browser, count]) => ({
        browser,
        count,
        percentage: ((count / impressions.length) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)

    const devices = Array.from(deviceMap.entries())
      .map(([device, count]) => ({
        device,
        count,
        percentage: ((count / impressions.length) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)

    const operatingSystems = Array.from(osMap.entries())
      .map(([os, count]) => ({
        os,
        count,
        percentage: ((count / impressions.length) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)

    // Group by country
    const countryMap = new Map<string, number>()
    impressions.forEach(imp => {
      const country = imp.country || 'Unknown'
      countryMap.set(country, (countryMap.get(country) || 0) + 1)
    })

    const countries = Array.from(countryMap.entries())
      .map(([country, count]) => ({
        country,
        count,
        percentage: ((count / impressions.length) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10) // Top 10 countries

    // Group by day for chart
    const dailyMap = new Map<string, number>()
    impressions.forEach(imp => {
      const day = imp.timestamp.toISOString().split('T')[0]
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1)
    })

    const chartData = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

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
        totalImpressions,
        impressionsInPeriod,
        growth: totalImpressions > 0
          ? ((impressionsInPeriod / totalImpressions) * 100).toFixed(1)
          : '0'
      },
      topSources,
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
    console.error('[Analytics API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
