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
    const videoIdOrLink = searchParams.get('q') || ''

    if (!videoIdOrLink) {
      return NextResponse.json({ error: 'Video ID or link required' }, { status: 400 })
    }

    // Extract video ID from link if a full URL is provided
    let videoId = videoIdOrLink
    if (videoIdOrLink.includes('pornhub.com')) {
      const match = videoIdOrLink.match(/viewkey=([a-zA-Z0-9]+)/)
      if (!match) {
        return NextResponse.json({ error: 'Invalid PornHub link' }, { status: 400 })
      }
      videoId = match[1]
    }

    // Fetch video details from PornHub
    const pornhub = new PornHub()
    const video = await pornhub.video(videoId)

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // Now search for the video by title to get previewVideo
    let previewVideo: string | undefined = undefined
    try {
      const searchResults = await pornhub.searchVideo(video.title, { page: 1 })
      // Find the matching video in search results
      const matchedVideo = searchResults.data.find(v => v.id === videoId)
      if (matchedVideo?.previewVideo) {
        previewVideo = matchedVideo.previewVideo
      }
    } catch (error) {
      console.warn('Failed to fetch preview video from search:', error)
      // Continue without previewVideo if search fails
    }

    return NextResponse.json({
      id: video.id,
      videoId: video.id,
      title: video.title,
      preview: video.preview,
      previewVideo,
      url: video.url,
    })
  } catch (error) {
    console.error('Error fetching video:', error)
    return NextResponse.json({ error: 'Failed to fetch video details' }, { status: 500 })
  }
}
