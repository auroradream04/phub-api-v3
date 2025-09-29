import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const quality = request.nextUrl.searchParams.get('q')

    if (!id || id.trim() === '') {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      )
    }

    if (!quality) {
      return NextResponse.json(
        { error: 'Quality parameter (q) is required' },
        { status: 400 }
      )
    }

    const pornhub = new PornHub()
    let videoInfo

    try {
      videoInfo = await pornhub.video(id)
    } catch (error: unknown) {
      console.error('[Stream] Request failed without proxy:', error instanceof Error ? error.message : 'Unknown error')
    }

    let retries = 3
    while ((videoInfo === undefined || videoInfo === null || !videoInfo.mediaDefinitions || videoInfo.mediaDefinitions.length < 1) && retries > 0) {
      const proxyAgent = getRandomProxy()

      if (!proxyAgent) {
        console.warn('[Stream] No proxies available. Cannot retry.')
        break
      }

      console.log(`[Stream] Retrying with proxy (${retries} retries remaining)...`)
      pornhub.setAgent(proxyAgent)

      try {
        videoInfo = await pornhub.video(id)
      } catch (error: unknown) {
        console.error('[Stream] Request failed with proxy:', error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
    }

    if (!videoInfo || !videoInfo.mediaDefinitions || videoInfo.mediaDefinitions.length < 1) {
      throw new Error('Failed to fetch video information')
    }

    const mediaDefinition = videoInfo.mediaDefinitions.find(
      (md) => md.quality.toString() === quality
    )

    if (!mediaDefinition) {
      return NextResponse.json(
        { error: `Quality ${quality} not found` },
        { status: 404 }
      )
    }

    const originalM3u8Url = mediaDefinition.videoUrl

    console.log(`[Stream] Fetching original m3u8 from: ${originalM3u8Url}`)
    const m3u8Response = await fetch(originalM3u8Url)

    if (!m3u8Response.ok) {
      throw new Error(`Failed to fetch m3u8: ${m3u8Response.status}`)
    }

    const originalM3u8 = await m3u8Response.text()

    if (isMasterPlaylist(originalM3u8)) {
      console.log('[Stream] Detected master playlist, fetching variant playlist')

      const variantUrl = extractFirstVariantUrl(originalM3u8, originalM3u8Url)

      if (!variantUrl) {
        throw new Error('Could not extract variant playlist URL')
      }

      console.log(`[Stream] Fetching variant playlist from: ${variantUrl}`)
      const variantResponse = await fetch(variantUrl)

      if (!variantResponse.ok) {
        throw new Error(`Failed to fetch variant playlist: ${variantResponse.status}`)
      }

      const variantM3u8 = await variantResponse.text()
      const modifiedM3u8 = await injectAds(variantM3u8, quality, variantUrl, id)

      return new Response(modifiedM3u8, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'public, max-age=30',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const modifiedM3u8 = await injectAds(originalM3u8, quality, originalM3u8Url, id)

    return new Response(modifiedM3u8, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=30',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (error) {
    console.error('[Stream] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate stream' },
      { status: 500 }
    )
  }
}

function isMasterPlaylist(m3u8Text: string): boolean {
  return m3u8Text.includes('#EXT-X-STREAM-INF')
}

function extractFirstVariantUrl(m3u8Text: string, baseUrl: string): string | null {
  const lines = m3u8Text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const nextLine = lines[i + 1]
      if (nextLine && nextLine.trim() !== '') {
        if (nextLine.startsWith('http')) {
          return nextLine.trim()
        } else {
          const baseUrlObj = new URL(baseUrl)
          const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/'))
          return `${baseUrlObj.origin}${basePath}/${nextLine.trim()}`
        }
      }
    }
  }

  return null
}

async function injectAds(m3u8Text: string, quality: string, baseUrl: string, videoId: string): Promise<string> {
  const lines = m3u8Text.split('\n')
  const result: string[] = []

  let headerComplete = false
  const baseUrlObj = new URL(baseUrl)
  const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/'))

  // Get active ads from database (get all segments)
  const activeAds = await prisma.ad.findMany({
    where: { status: 'active' },
    include: {
      segments: true
    }
  })

  // Select a random ad if available
  const selectedAd = activeAds.length > 0
    ? activeAds[Math.floor(Math.random() * activeAds.length)]
    : null

  for (const line of lines) {
    if (line.startsWith('#EXTM3U') ||
        line.startsWith('#EXT-X-VERSION') ||
        line.startsWith('#EXT-X-TARGETDURATION') ||
        line.startsWith('#EXT-X-MEDIA-SEQUENCE') ||
        line.startsWith('#EXT-X-PLAYLIST-TYPE')) {
      result.push(line)

      if (line.startsWith('#EXT-X-TARGETDURATION') && !headerComplete) {
        headerComplete = true

        if (selectedAd && selectedAd.segments.length > 0) {
          console.log(`[Stream] Injecting ad "${selectedAd.title}" for quality ${quality}`)

          // Select a random segment from the ad
          const randomSegment = selectedAd.segments[Math.floor(Math.random() * selectedAd.segments.length)]

          // Calculate segment duration (3 seconds default)
          const segmentDuration = 3

          // Add ad segment - serve through our API
          result.push(`#EXTINF:${segmentDuration}.0,`)
          // Create URL that will serve the specific segment
          const adUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:4444'}/api/ads/serve/${selectedAd.id}/${randomSegment.quality}`
          result.push(adUrl)

          // Record impression
          try {
            await prisma.adImpression.create({
              data: {
                adId: selectedAd.id,
                videoId: videoId
              }
            })
          } catch (error) {
            console.error('Failed to record ad impression:', error)
          }
        } else {
          console.log(`[Stream] No ads available for quality ${quality}`)
        }
      }
    } else if (line.startsWith('#')) {
      result.push(line)
    } else if (line.trim() !== '') {
      if (line.startsWith('http')) {
        result.push(line)
      } else {
        const absoluteUrl = `${baseUrlObj.origin}${basePath}/${line.trim()}`
        result.push(absoluteUrl)
      }
    }
  }

  return result.join('\n')
}