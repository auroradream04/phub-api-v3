import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/admin/domains/[id] - Update domain access
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { status, type, reason } = body

    // Check if domain exists
    const existing = await prisma.domainAccess.findUnique({
      where: { id }
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    // Update domain
    const updated = await prisma.domainAccess.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(type && { type }),
        ...(reason !== undefined && { reason })
      }
    })

    console.log(`[Admin] Domain ${existing.domain} updated by ${session.user.email}`)

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[API] Error updating domain:', error)
    return NextResponse.json(
      { error: 'Failed to update domain' },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/domains/[id] - Remove domain rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // Check if domain exists
    const existing = await prisma.domainAccess.findUnique({
      where: { id }
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    // Delete domain (logs will be set to null due to onDelete: SetNull)
    await prisma.domainAccess.delete({
      where: { id }
    })

    console.log(`[Admin] Domain ${existing.domain} deleted by ${session.user.email}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Error deleting domain:', error)
    return NextResponse.json(
      { error: 'Failed to delete domain' },
      { status: 500 }
    )
  }
}
