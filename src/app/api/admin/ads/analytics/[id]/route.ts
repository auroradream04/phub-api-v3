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
        },
        segments: {
          orderBy: { quality: 'desc' },
          take: 1
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
        videoId: true,
        timestamp: true
      }
    })

    // Calculate total impressions (all time)
    const totalImpressions = ad._count.impressions

    // Calculate impressions in period
    const impressionsInPeriod = impressions.length

    // Group by referrer for top sources
    const referrerMap = new Map<string, number>()
    impressions.forEach(imp => {
      const referrer = imp.referrer || 'direct'
      referrerMap.set(referrer, (referrerMap.get(referrer) || 0) + 1)
    })

    const topSources = Array.from(referrerMap.entries())
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
    impressions.forEach(imp => {
      const ua = imp.userAgent || 'unknown'
      // Simple browser detection
      let browser = 'Other'
      if (ua.includes('Edg')) browser = 'Microsoft Edge'
      else if (ua.includes('Chrome')) browser = 'Chrome'
      else if (ua.includes('Safari')) browser = 'Safari'
      else if (ua.includes('Firefox')) browser = 'Firefox'

      browserMap.set(browser, (browserMap.get(browser) || 0) + 1)
    })

    const browsers = Array.from(browserMap.entries())
      .map(([browser, count]) => ({
        browser,
        count,
        percentage: ((count / impressions.length) * 100).toFixed(1)
      }))
      .sort((a, b) => b.count - a.count)

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
        status: ad.status,
        weight: ad.weight,
        forceDisplay: ad.forceDisplay,
        duration: ad.duration,
        previewUrl: ad.segments[0]?.filepath || null
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
