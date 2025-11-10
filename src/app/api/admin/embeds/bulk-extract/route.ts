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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalRequest = (pornhubEn.engine.request.get as any).bind(pornhubEn.engine.request)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pornhubEn.engine.request as any).get = async (url: string): Promise<any> => {
      // Replace cn.pornhub.com with www.pornhub.com for searches
      const enUrl = url.replace(/cn\.pornhub\.com/g, 'www.pornhub.com')
      console.log(`Fetching from: ${enUrl}`)
      return originalRequest(enUrl)
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
          let videoTitle = $('h1.title span').text().trim() ||
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

          // Clean up the title: remove everything after " - " (usually channel/creator name)
          // This improves search accuracy
          videoTitle = videoTitle.split(' - ')[0].trim()

          console.log(`✓ Extracted English title: ${videoTitle}`)

          // Now fetch metadata (preview image) using pornhubEn
          const video = await pornhubEn.video(viewkey)
          const videoPreview = video?.preview || ''

          // Use the extracted English title, NOT the video.title which is localized
          const englishTitle = videoTitle

          // Search for the video by title to get previewVideo (optional)
          // Use the English title extracted from the page, not the localized one from video.title
          let previewVideo: string | undefined = undefined
          try {
            console.log(`Searching for preview with English title: ${englishTitle}`)
            const searchResults = await pornhubEn.searchVideo(englishTitle, { page: 1 })
            const matchedVideo = searchResults.data.find((v) => v.id === viewkey)
            if (matchedVideo?.previewVideo) {
              previewVideo = matchedVideo.previewVideo
              console.log(`✓ Found preview video URL: ${previewVideo}`)
            } else {
              console.log(`⚠ No preview video found in search results for ${viewkey}, trying uploader fallback...`)

              // Fallback: Try to find the video on the uploader's page
              try {
                // Extract uploader URL from the page
                let uploaderUrl = $('a[href*="/model/"], a[href*="/channels/"], a[href*="/users/"]').first().attr('href') || ''

                if (!uploaderUrl) {
                  throw new Error('Could not find uploader link')
                }

                // Convert to full URL if relative
                if (uploaderUrl.startsWith('/')) {
                  uploaderUrl = 'https://www.pornhub.com' + uploaderUrl
                }

                // Normalize the uploader URL
                // Convert /users/* to /channels/*
                uploaderUrl = uploaderUrl.replace('/users/', '/channels/')

                // Add /videos endpoint if not present
                if (!uploaderUrl.includes('/videos')) {
                  uploaderUrl += '/videos'
                }

                console.log(`Searching uploader page: ${uploaderUrl}`)

                // Fetch uploader's videos page
                const uploaderResponse = await fetch(uploaderUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                  }
                })

                if (uploaderResponse.ok) {
                  const uploaderHtml = await uploaderResponse.text()
                  const $uploader = load(uploaderHtml)

                  // Find the video in uploader's list
                  const uploaderVideos = $uploader('li.videoblock')
                  let found = false

                  uploaderVideos.each((_index, el) => {
                    const videoLink = $uploader(el).find('a').attr('href') || ''
                    if (videoLink.includes(viewkey)) {
                      // Found it! Extract preview video
                      const videoElement = $uploader(el).find('video source').attr('src')
                      if (videoElement) {
                        previewVideo = videoElement
                        found = true
                        console.log(`✓ Found video on uploader page: ${previewVideo}`)
                      }
                    }
                  })

                  if (!found) {
                    console.log(`⚠ Video not found on uploader page either`)
                  }
                }
              } catch (uploaderErr) {
                console.log(`Uploader fallback failed: ${uploaderErr instanceof Error ? uploaderErr.message : 'Unknown error'}`)
              }
            }
          } catch (searchErr) {
            console.log(`Search failed for ${viewkey}: ${searchErr instanceof Error ? searchErr.message : 'Unknown error'}`)
          }

          console.log(`✓ Successfully extracted: ${englishTitle}`)
          return {
            inputLink: link,
            viewkey,
            title: englishTitle,
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
