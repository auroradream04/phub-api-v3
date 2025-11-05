import { getServerSession } from 'next-auth/next'
import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from '@/lib/pornhub.js'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('q') || ''
    const page = parseInt(searchParams.get('page') || '1')

    if (!keyword || keyword.length < 2) {
      return NextResponse.json({ error: 'Search term too short' }, { status: 400 })
    }

    // Create PornHub instance and search
    const pornhub = new PornHub()
    const result = await pornhub.searchVideo(keyword, { page })

    // Filter and format results
    const videos = result.data.map(video => ({
      id: video.id,
      videoId: video.id,
      title: video.title,
      preview: video.preview,
      previewVideo: video.previewVideo,
      url: video.url,
    }))

    return NextResponse.json({
      videos,
      paging: result.paging,
      counting: result.counting,
    })
  } catch {

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
