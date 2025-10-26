import { getServerSession } from 'next-auth/next'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

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

    return NextResponse.json({
      embedId: id,
      impressions,
      clicks,
      ctr: Math.round(ctr * 100) / 100,
      domainBreakdown,
      dailyStats,
      period: { from: dateFrom.toISOString(), to: new Date().toISOString() },
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
