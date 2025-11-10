import { getServerSession } from 'next-auth/next'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { PornHub } from '@/lib/pornhub.js'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { load } from 'cheerio'

const bulkExtractSchema = z.object({
  links: z.array(z.string().min(1, 'Link cannot be empty')).min(1, 'At least one link is required'),
})

interface ExtractedVideo {
  inputLink: string
  viewkey: string
  title: string
  preview: string
  previewVideo?: string
  videoId: string
  error?: string
}

export async function POST(req: NextRequest) {
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

    const body = await req.json()
    console.log('Bulk extract request body:', body)
    const { links } = bulkExtractSchema.parse(body)
    console.log('Parsed links:', links)

    // Create a PornHub instance for bulk extraction from English site
    // The default instance uses cn.pornhub.com which can cause search failures for non-English titles
    const pornhubEn = new PornHub()

    // The library has hardcoded BASE_URL in the Route, so we need to patch it
    // by intercepting the request and replacing cn.pornhub.com with www.pornhub.com
    const originalRequest = pornhubEn.engine.request.get.bind(pornhubEn.engine.request)
    pornhubEn.engine.request.get = async (url: string, ...args: any[]) => {
      // Replace cn.pornhub.com with www.pornhub.com for searches
      const enUrl = url.replace(/cn\.pornhub\.com/g, 'www.pornhub.com')
      console.log(`Fetching from: ${enUrl}`)
      return originalRequest(enUrl, ...args)
    }

    const extractedVideos: ExtractedVideo[] = []

    // Helper function to process a single video
    async function processVideo(link: string): Promise<ExtractedVideo> {
      try {
        // Extract viewkey from link
        const match = link.match(/viewkey=([a-zA-Z0-9]+)/)
        if (!match) {
          return {
            inputLink: link,
            viewkey: '',
            title: '',
            preview: '',
            videoId: '',
            error: 'Invalid PornHub link format',
          }
        }

        const viewkey = match[1]

        try {
          console.log(`Fetching video from English site: ${link}`)

          // Fetch the English page directly to get the English title
          const englishUrl = link.includes('www.pornhub.com') ? link : link.replace(/cn\.pornhub\.com/g, 'www.pornhub.com')
          const response = await fetch(englishUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          })

          if (!response.ok) {
            return {
              inputLink: link,
              viewkey,
              title: '',
              preview: '',
              videoId: '',
              error: `Failed to fetch video page: ${response.status}`,
            }
          }

          const html = await response.text()
          const $ = load(html)

          // Extract English title from the page
          const videoTitle = $('h1.title span').text().trim() ||
                            $('h1 span').text().trim() ||
                            $('[data-video-title]').attr('data-video-title') ||
                            ''

          if (!videoTitle) {
            console.log(`⚠ Could not extract title from page for ${viewkey}`)
            return {
              inputLink: link,
              viewkey,
              title: '',
              preview: '',
              videoId: '',
              error: 'Could not extract video title',
            }
          }

          console.log(`✓ Extracted English title: ${videoTitle}`)

          // Now fetch metadata (preview image) using pornhubEn
          const video = await pornhubEn.video(viewkey)
          const videoPreview = video?.preview || ''

          // Search for the video by title to get previewVideo (optional)
          let previewVideo: string | undefined = undefined
          try {
            const searchResults = await pornhubEn.searchVideo(video.title, { page: 1 })
            const matchedVideo = searchResults.data.find((v) => v.id === viewkey)
            if (matchedVideo?.previewVideo) {
              previewVideo = matchedVideo.previewVideo
              console.log(`✓ Found preview video URL: ${previewVideo}`)
            } else {
              console.log(`⚠ No preview video found in search results for ${viewkey}`)
            }
          } catch (searchErr) {
            console.log(`Search failed for ${viewkey}, continuing without preview video: ${searchErr instanceof Error ? searchErr.message : 'Unknown error'}`)
          }

          console.log(`✓ Successfully extracted: ${videoTitle}`)
          return {
            inputLink: link,
            viewkey,
            title: videoTitle,
            preview: videoPreview,
            previewVideo,
            videoId: viewkey,
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to fetch video'
          console.log(`✗ Error fetching ${viewkey}: ${errorMsg}`)
          return {
            inputLink: link,
            viewkey,
            title: '',
            preview: '',
            videoId: '',
            error: errorMsg,
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to process link'
        return {
          inputLink: link,
          viewkey: '',
          title: '',
          preview: '',
          videoId: '',
          error: errorMsg,
        }
      }
    }

    // Process all videos concurrently in batches of 3 to avoid rate limiting
    const batchSize = 3
    for (let i = 0; i < links.length; i += batchSize) {
      const batch = links.slice(i, i + batchSize)
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(links.length / batchSize)}`)
      const batchResults = await Promise.all(batch.map(processVideo))
      extractedVideos.push(...batchResults)
    }

    console.log(`Completed extracting ${extractedVideos.length} videos`)
    return NextResponse.json({ videos: extractedVideos })
  } catch (error) {
    console.error('Bulk extract error:', error)
    if (error instanceof z.ZodError) {
      console.error('Zod validation error:', error.flatten())
      return NextResponse.json({ error: error.flatten() }, { status: 400 })
    }

    const errorMsg = error instanceof Error ? error.message : 'Internal server error'
    console.error('Final error response:', errorMsg)
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
