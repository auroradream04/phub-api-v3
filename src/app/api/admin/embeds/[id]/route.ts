import { getServerSession } from 'next-auth/next'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

const updateEmbedSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  displayName: z.string().max(255).optional().nullable(),
  redirectUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
  preview: z.string().url().optional(),
  previewVideo: z.string().url().optional().nullable(),
})

async function validateAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email! },
  })

  if (user?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await validateAdmin()
    if ('error' in auth) return auth.error

    const embed = await prisma.videoEmbed.findUnique({ where: { id } })
    if (!embed) {
      return NextResponse.json({ error: 'Embed not found' }, { status: 404 })
    }

    return NextResponse.json(embed)
  } catch (error) {
    console.error('Error fetching embed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await validateAdmin()
    if ('error' in auth) return auth.error

    const body = await req.json()
    const data = updateEmbedSchema.parse(body)

    // Check if embed exists
    const embed = await prisma.videoEmbed.findUnique({ where: { id } })
    if (!embed) {
      return NextResponse.json({ error: 'Embed not found' }, { status: 404 })
    }

    const updated = await prisma.videoEmbed.update({
      where: { id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }
    console.error('Error updating embed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await validateAdmin()
    if ('error' in auth) return auth.error

    const embed = await prisma.videoEmbed.findUnique({ where: { id } })
    if (!embed) {
      return NextResponse.json({ error: 'Embed not found' }, { status: 404 })
    }

    await prisma.videoEmbed.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting embed:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
