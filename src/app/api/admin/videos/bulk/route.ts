import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { ids } = body as { ids: string[] }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'No IDs provided' },
        { status: 400 }
      )
    }

    // Delete all videos in a single operation
    const deleted = await prisma.video.deleteMany({
      where: {
        vodId: {
          in: ids,
        },
      },
    })

    return NextResponse.json({
      success: true,
      deleted: deleted.count,
      requested: ids.length,
    })
  } catch (error) {
    console.error('Failed to delete videos:', error)
    return NextResponse.json(
      { error: 'Failed to delete videos' },
      { status: 500 }
    )
  }
}
