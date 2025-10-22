import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

// GET /api/admin/domains - List all domains with pagination and filters
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status') // allowed, blocked
    const search = searchParams.get('search')

    const skip = (page - 1) * limit

    // Build where clause
    const where: { status?: string; domain?: { contains: string; mode: 'insensitive' } } = {}
    if (status) where.status = status
    if (search) {
      where.domain = {
        contains: search,
        mode: 'insensitive'
      }
    }

    // Get domains with request counts
    const [domains, total] = await Promise.all([
      prisma.domainAccess.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { requestLogs: true }
          }
        }
      }),
      prisma.domainAccess.count({ where })
    ])

    // Get request counts for last 7 days for each domain
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const domainsWithStats = await Promise.all(
      domains.map(async (domain) => {
        const recentRequests = await prisma.apiRequestLog.count({
          where: {
            domainAccessId: domain.id,
            timestamp: { gte: sevenDaysAgo }
          }
        })

        return {
          ...domain,
          totalRequests: domain._count.requestLogs,
          recentRequests
        }
      })
    )

    return NextResponse.json({
      domains: domainsWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('[API] Error fetching domains:', error)
    return NextResponse.json(
      { error: 'Failed to fetch domains' },
      { status: 500 }
    )
  }
}

// POST /api/admin/domains - Add new domain to whitelist/blacklist
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { domain, status, type, reason } = body

    // Validate required fields
    if (!domain || !status || !type) {
      return NextResponse.json(
        { error: 'Domain, status, and type are required' },
        { status: 400 }
      )
    }

    // Validate domain format (basic check)
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]$/
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        { error: 'Invalid domain format' },
        { status: 400 }
      )
    }

    // Check if domain already exists
    const existing = await prisma.domainAccess.findUnique({
      where: { domain }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Domain already exists' },
        { status: 409 }
      )
    }

    // Create new domain rule
    const newDomain = await prisma.domainAccess.create({
      data: {
        domain,
        status,
        type,
        reason,
        addedBy: session.user.id
      }
    })

    console.log(`[Admin] Domain ${domain} added with status: ${status}, type: ${type}`)

    return NextResponse.json(newDomain, { status: 201 })
  } catch (error) {
    console.error('[API] Error creating domain:', error)
    return NextResponse.json(
      { error: 'Failed to create domain' },
      { status: 500 }
    )
  }
}
