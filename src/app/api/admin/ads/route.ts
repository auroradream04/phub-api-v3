import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import type { Session } from 'next-auth'

// GET all ads
export async function GET() {
  try {
    const session = await getServerSession(authOptions) as Session | null

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ads = await prisma.ad.findMany({
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        },
        segments: {
          select: {
            quality: true,
            filesize: true,
            filepath: true
          }
        },
        _count: {
          select: {
            impressions: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json(ads)
  } catch (error) {
    console.error('Error fetching ads:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ads' },
      { status: 500 }
    )
  }
}

// DELETE an ad
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions) as Session | null

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Ad ID is required' },
        { status: 400 }
      )
    }

    // Delete the ad and all related data (cascade delete handles segments and impressions)
    await prisma.ad.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting ad:', error)
    return NextResponse.json(
      { error: 'Failed to delete ad' },
      { status: 500 }
    )
  }
}

// PATCH - Update ad status or other fields
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions) as Session | null

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, status, title, description } = body

    if (!id) {
      return NextResponse.json(
        { error: 'Ad ID is required' },
        { status: 400 }
      )
    }

    const updateData: Record<string, string | number> = {}
    if (status !== undefined) updateData.status = status
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description

    const updatedAd = await prisma.ad.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        },
        segments: {
          select: {
            quality: true,
            filesize: true,
            filepath: true
          }
        },
        _count: {
          select: {
            impressions: true
          }
        }
      }
    })

    return NextResponse.json(updatedAd)
  } catch (error) {
    console.error('Error updating ad:', error)
    return NextResponse.json(
      { error: 'Failed to update ad' },
      { status: 500 }
    )
  }
}