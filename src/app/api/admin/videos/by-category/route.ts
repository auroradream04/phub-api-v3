import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const variants = searchParams.getAll('variants')

    // Handle both single category and multiple variants
    const whereClause: any = {}

    if (variants && variants.length > 0) {
      // Multiple variants (for consolidated categories)
      whereClause.typeName = {
        in: variants,
        mode: 'insensitive',
      }
    } else if (category) {
      // Single category
      whereClause.typeName = {
        equals: category,
        mode: 'insensitive',
      }
    } else {
      return NextResponse.json(
        { error: 'Category or variants required' },
        { status: 400 }
      )
    }

    const videos = await prisma.video.findMany({
      where: whereClause,
      select: {
        vodId: true,
        vodName: true,
        vodPic: true,
        views: true,
        typeName: true,
      },
      orderBy: {
        vodTime: 'desc',
      },
      take: 20,
    })

    return NextResponse.json({ list: videos })
  } catch (error) {
    console.error('Failed to fetch videos by category:', error)
    return NextResponse.json(
      { error: 'Failed to fetch videos' },
      { status: 500 }
    )
  }
}
