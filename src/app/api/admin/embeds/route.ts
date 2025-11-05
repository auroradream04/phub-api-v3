import { getServerSession } from 'next-auth/next'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
// import { prisma } from '@/lib/prisma'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

const createEmbedSchema = z.object({
  videoId: z.string().min(1, 'Video ID is required'),
  title: z.string().min(1, 'Title is required').max(255),
  displayName: z.string().max(255).optional().nullable().transform(val => val || null),
  redirectUrl: z.string().url('Redirect URL must be valid'),
  previewSourceUrl: z.string().optional().nullable().transform(val => val || null),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    })

    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''

    const skip = (page - 1) * limit

    const where = search ? {
      OR: [
        { title: { contains: search } },
        { videoId: { contains: search } },
      ],
    } : {}

    const [embeds, total] = await Promise.all([
      prisma.videoEmbed.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              analytics: true,
            },
          },
        },
      }),
      prisma.videoEmbed.count({ where }),
    ])

    // Get click and impression counts for each embed
    const embedsWithCounts = await Promise.all(
      embeds.map(async (embed) => {
        const [impressions, clicks] = await Promise.all([
          prisma.embedAnalytics.count({
            where: { embedId: embed.id, eventType: 'impression' },
          }),
          prisma.embedAnalytics.count({
            where: { embedId: embed.id, eventType: 'click' },
          }),
        ])
        return { ...embed, impressions, clicks }
      })
    )

    return NextResponse.json({
      data: embedsWithCounts,
      total,
      pages: Math.ceil(total / limit),
    })
  } catch {

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json()
    const data = createEmbedSchema.parse(body)

    const embed = await prisma.videoEmbed.create({
      data: {
        videoId: data.videoId,
        title: data.title,
        displayName: data.displayName,
        redirectUrl: data.redirectUrl,
        previewSourceUrl: data.previewSourceUrl,
        createdBy: user!.id,
      },
    })

    return NextResponse.json(embed, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
