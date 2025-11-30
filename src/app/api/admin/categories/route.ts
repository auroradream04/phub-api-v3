import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get actual category names from the Video table with counts
    const categories = await prisma.video.groupBy({
      by: ['typeName'],
      _count: true,
      orderBy: { _count: { typeName: 'desc' } }
    })

    return NextResponse.json({
      categories: categories.map(c => ({
        name: c.typeName,
        count: c._count
      })),
      total: categories.length
    })
  } catch (error) {
    console.error('Failed to fetch video categories:', error)
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    )
  }
}
