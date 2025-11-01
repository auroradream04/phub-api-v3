import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Cleanup endpoint to remove all videos with "Unknown" category
 * These were created before the database lookup fix was applied
 *
 * Usage: POST /api/scraper/cleanup-unknown
 */
export async function POST(request: NextRequest) {
  try {
    // Find all videos with "Unknown" category
    const unknownVideos = await prisma.video.findMany({
      where: {
        typeName: 'Unknown'
      },
      select: {
        vodId: true,
        vodName: true
      }
    })

    if (unknownVideos.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No Unknown category videos found',
        deleted: 0
      })
    }

    console.log(`[Cleanup] Found ${unknownVideos.length} videos with "Unknown" category`)

    // Delete all Unknown category videos
    const result = await prisma.video.deleteMany({
      where: {
        typeName: 'Unknown'
      }
    })

    console.log(`[Cleanup] Deleted ${result.count} videos with Unknown category`)

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${result.count} videos with Unknown category`,
      deleted: result.count,
      details: unknownVideos.slice(0, 5) // Show first 5 as examples
    })
  } catch (error) {
    console.error('[Cleanup] Error:', error)
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

// GET endpoint to check how many Unknown videos exist
export async function GET() {
  try {
    const unknownCount = await prisma.video.count({
      where: {
        typeName: 'Unknown'
      }
    })

    // Also get breakdown by typeId
    const breakdown = await prisma.video.groupBy({
      by: ['typeId', 'typeName'],
      where: {
        typeName: 'Unknown'
      },
      _count: true
    })

    return NextResponse.json({
      success: true,
      totalUnknownVideos: unknownCount,
      breakdown
    })
  } catch (error) {
    console.error('[Cleanup] Error:', error)
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
