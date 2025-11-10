import { getServerSession } from 'next-auth/next'
import { NextRequest, NextResponse } from 'next/server'
import { load } from 'cheerio'
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
    const videoLink = searchParams.get('q') || ''

    if (!videoLink) {
      return NextResponse.json({ error: 'Video link required' }, { status: 400 })
    }

    // Extract viewkey from link
    const match = videoLink.match(/viewkey=([a-zA-Z0-9]+)/)
    if (!match) {
      return NextResponse.json({ error: 'Invalid PornHub link' }, { status: 400 })
    }

    const viewkey = match[1]

    try {
      // Fetch the English page directly to get the English title
      const englishUrl = videoLink.includes('www.pornhub.com') ? videoLink : videoLink.replace(/cn\.pornhub\.com/g, 'www.pornhub.com')
      const response = await fetch(englishUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      if (!response.ok) {
        return NextResponse.json({ error: `Failed to fetch video: ${response.status}` }, { status: response.status })
      }

      const html = await response.text()
      const $ = load(html)

      // Extract English title from the page
      let title = $('h1.title span').text().trim() ||
                    $('h1 span').text().trim() ||
                    $('[data-video-title]').attr('data-video-title') ||
                    ''

      if (!title) {
        return NextResponse.json({ error: 'Could not extract video title' }, { status: 400 })
      }

      // Clean up the title: remove everything after " - " (usually channel/creator name)
      // This improves search accuracy
      title = title.split(' - ')[0].trim()

      // Now fetch metadata (preview image) using PornHub library
      const pornhub = new PornHub()
      // Override to use English site
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalRequest = (pornhub.engine.request.get as any).bind(pornhub.engine.request)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (pornhub.engine.request as any).get = async (url: string): Promise<any> => {
        const enUrl = url.replace(/cn\.pornhub\.com/g, 'www.pornhub.com')
        return originalRequest(enUrl)
      }

      const video = await pornhub.video(viewkey)

      if (!video) {
        return NextResponse.json({ error: 'Video not found' }, { status: 404 })
      }

      // Search for preview video using the English title
      let previewVideo: string | undefined = undefined
      try {
        const searchResults = await pornhub.searchVideo(title, { page: 1 })
        const matchedVideo = searchResults.data.find(v => v.id === viewkey)
        if (matchedVideo?.previewVideo) {
          previewVideo = matchedVideo.previewVideo
        }
      } catch {
        // Continue without previewVideo if search fails
      }

      return NextResponse.json({
        id: viewkey,
        videoId: viewkey,
        title,
        preview: video.preview,
        previewVideo,
        url: englishUrl,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch video details'
      return NextResponse.json({ error: errorMsg }, { status: 500 })
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
