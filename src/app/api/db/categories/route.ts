import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCategoryChineseName } from '@/lib/category-mapping'

export const revalidate = 3600 // 1 hour

export async function GET(request: NextRequest) {
  try {
    // Get all unique typeName (categories) from videos in database
    const videos = await prisma.video.findMany({
      select: { typeName: true },
      where: {
        typeName: {
          not: null
        }
      },
      distinct: ['typeName'],
      orderBy: {
        typeName: 'asc'
      }
    })

    console.log('[DB Categories] Found videos with typeNames:', videos.length)

    // Extract and consolidate categories
    const categoriesSet = new Set<string>()

    videos.forEach(video => {
      if (video.typeName && video.typeName.trim()) {
        // Get consolidated Chinese name
        const chineseName = getCategoryChineseName(video.typeName.trim())
        categoriesSet.add(chineseName)
      }
    })

    console.log('[DB Categories] Consolidated to:', categoriesSet.size, 'unique categories')

    const categories = Array.from(categoriesSet).sort().map((name, index) => ({
      id: index,
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
