import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCategoryChineseName } from '@/lib/category-mapping'

export const revalidate = 3600 // 1 hour

export async function GET(request: NextRequest) {
  try {
    // Get all unique categories from videos in database
    const videos = await prisma.video.findMany({
      select: { category: true },
      where: {
        AND: [
          { category: { not: null } },
          { category: { not: '' } }
        ]
      },
      distinct: ['category']
    })

    // Extract and consolidate categories
    const categoriesSet = new Set<string>()

    videos.forEach(video => {
      if (video.category) {
        // Split by comma and process each category
        video.category.split(',').forEach(cat => {
          const trimmed = cat.trim()
          if (trimmed) {
            // Get consolidated Chinese name
            const chineseName = getCategoryChineseName(trimmed)
            categoriesSet.add(chineseName)
          }
        })
      }
    })

    const categories = Array.from(categoriesSet).sort().map(name => ({
      id: categoriesSet.size, // Just use a simple ID
      name
    }))

    return NextResponse.json({
      categories,
      total: categories.length,
      cached: false,
      source: 'database'
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch categories'
      },
      { status: 500 }
    )
  }
}
