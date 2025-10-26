import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { prisma } from '@/lib/prisma'
import { getSiteSetting, SETTING_KEYS } from '@/lib/site-settings'
import { getClientIP, getCountryFromIP } from '@/lib/geo'
import { checkAndLogDomain } from '@/lib/domain-middleware'

export const revalidate = 7200 // 2 hours

interface AdWithSegments {
  id: string
  title: string
  weight: number
  segments: Array<{ quality: number }>
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestStart = Date.now()
  const { id } = await params

  // Check domain access
  const domainCheck = await checkAndLogDomain(request, `/api/watch/${id}/stream`, 'GET')
  if (!domainCheck.allowed) {
    return domainCheck.response
  }

  try {
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
    let videoInfo = null

    // ALWAYS use proxy - try up to 3 different proxies
    let retries = 3
    let attemptNum = 1

    while (retries > 0 && !videoInfo) {
      // Select proxy BEFORE making request
      const proxyInfo = getRandomProxy('Stream API')

      if (!proxyInfo) {
        console.warn('[Stream] No proxies available. Cannot make request.')
        break
      }

      console.log(`[Stream] Attempt ${attemptNum}/3 for video ${id} (quality: ${quality}) using proxy ${proxyInfo.proxyUrl}`)
      pornhub.setAgent(proxyInfo.agent)

      const startTime = Date.now()
      try {
        const response = await pornhub.video(id)

        const duration = Date.now() - startTime

        // Check for soft blocking (missing media definitions)
        if (!response.mediaDefinitions || response.mediaDefinitions.length < 1) {
          console.log(`[Stream] ⚠️  Proxy ${proxyInfo.proxyUrl} returned empty media definitions (soft block) after ${duration}ms - trying different proxy...`)
        } else {
          console.log(`[Stream] ✅ Proxy ${proxyInfo.proxyUrl} successful! Got ${response.mediaDefinitions.length} quality options in ${duration}ms`)
          videoInfo = response
        }
      } catch (error: unknown) {
        const duration = Date.now() - startTime
        console.error(`[Stream] ❌ Proxy ${proxyInfo.proxyUrl} failed after ${duration}ms:`, error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
      attemptNum++
    }

    if (!videoInfo || !videoInfo.mediaDefinitions || videoInfo.mediaDefinitions.length < 1) {
      await domainCheck.logRequest(500, Date.now() - requestStart)
      throw new Error('Failed to fetch video information')
    }

    const mediaDefinition = videoInfo.mediaDefinitions.find(
      (md) => md.quality.toString() === quality
    )

    if (!mediaDefinition) {
      await domainCheck.logRequest(404, Date.now() - requestStart)
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
      const modifiedM3u8 = await injectAds(variantM3u8, quality, variantUrl, id, request.headers)

      return new Response(modifiedM3u8, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    const modifiedM3u8 = await injectAds(originalM3u8, quality, originalM3u8Url, id, request.headers)

    // Log successful request
    await domainCheck.logRequest(200, Date.now() - requestStart)

    return new Response(modifiedM3u8, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (error) {
    console.error('[Stream] Error:', error)
    await domainCheck.logRequest(500, Date.now() - requestStart)
    return NextResponse.json(
      { error: 'Failed to generate stream' },
      { status: 500 }
    )
  }
}

function isMasterPlaylist(m3u8Text: string): boolean {
  return m3u8Text.includes('#EXT-X-STREAM-INF')
}

function selectAdByWeight(ads: AdWithSegments[]): AdWithSegments | null {
  // Calculate total weight
  const totalWeight = ads.reduce((sum, ad) => sum + ad.weight, 0)

  // Generate random number between 0 and totalWeight
  let random = Math.random() * totalWeight

  // Select ad based on weight
  for (const ad of ads) {
    random -= ad.weight
    if (random <= 0) {
      return ad
    }
  }

  // Fallback to first ad (shouldn't happen)
  return ads[0]
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

async function injectAds(m3u8Text: string, quality: string, baseUrl: string, videoId: string, headers: Headers): Promise<string> {
  const lines = m3u8Text.split('\n')
  const result: string[] = []

  let headerComplete = false
  const baseUrlObj = new URL(baseUrl)
  const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/'))

  // Get CORS proxy settings
  const corsProxyEnabled = (await getSiteSetting(SETTING_KEYS.CORS_PROXY_ENABLED, 'true')) === 'true'
  const corsProxyUrl = await getSiteSetting(SETTING_KEYS.CORS_PROXY_URL, 'https://cors.freechatnow.net/')

  // Get active ads from database (get all segments)
  const activeAds = await prisma.ad.findMany({
    where: { status: 'active' },
    include: {
      segments: true
    }
  })

  // Check if any ad is forced to display
  const forcedAd = activeAds.find(ad => ad.forceDisplay)

  // Select ad based on strategy
  let selectedAd = null

  if (forcedAd) {
    // If there's a forced ad, always use it
    selectedAd = forcedAd
  } else if (activeAds.length > 0) {
    // Use weighted random selection
    selectedAd = selectAdByWeight(activeAds)
  }

  // Get segments to skip from settings
  const segmentsToSkipSetting = await getSiteSetting(SETTING_KEYS.SEGMENTS_TO_SKIP, '2')
  const segmentsToSkip = parseInt(segmentsToSkipSetting, 10) || 2

  let segmentCount = 0
  let adInjected = false
  let pendingExtInf = ''
  let skippedSegments = 0

  for (const line of lines) {
    // Collect all header tags first
    if (line.startsWith('#EXTM3U') ||
        line.startsWith('#EXT-X-VERSION') ||
        line.startsWith('#EXT-X-TARGETDURATION') ||
        line.startsWith('#EXT-X-MEDIA-SEQUENCE') ||
        line.startsWith('#EXT-X-PLAYLIST-TYPE') ||
        line.startsWith('#EXT-X-ALLOW-CACHE')) {
      result.push(line)
      continue
    }

    // Store EXTINF tags temporarily
    if (line.startsWith('#EXTINF:')) {
      pendingExtInf = line
      continue
    }

    // After all headers, inject ad and skip first 2 segments
    if (!headerComplete && !line.startsWith('#') && line.trim() !== '') {
      headerComplete = true

      if (selectedAd && selectedAd.segments.length > 0 && !adInjected) {
        console.log(`[Stream] Injecting ad "${selectedAd.title}" for quality ${quality}, replacing first ${segmentsToSkip} segments`)

        // Select a random segment from the ad
        const randomSegment = selectedAd.segments[Math.floor(Math.random() * selectedAd.segments.length)]

        // Calculate segment duration (3 seconds default)
        const segmentDuration = 3

        // Add ad segment - serve through our API
        result.push(`#EXTINF:${segmentDuration}.0,`)
        // Create URL that will serve the specific segment with .ts extension
        const adUrl = `${process.env.NEXTAUTH_URL || 'http://md8av.com'}/api/ads/serve/${selectedAd.id}/${randomSegment.quality}.ts`
        result.push(adUrl)

        // Add discontinuity tag to signal timestamp reset after ad
        result.push('#EXT-X-DISCONTINUITY')

        adInjected = true

        // Record impression with referrer, user agent, IP, and country
        try {
          const clientIP = getClientIP(headers)
          const country = await getCountryFromIP(clientIP)

          await prisma.adImpression.create({
            data: {
              adId: selectedAd.id,
              videoId: videoId,
              referrer: headers.get('referer') || headers.get('origin') || 'direct',
              userAgent: headers.get('user-agent') || 'unknown',
              ipAddress: clientIP,
              country: country
            }
          })
        } catch (error) {
          console.error('Failed to record ad impression:', error)
        }

        // Skip the first segment (don't add it to result)
        console.log(`[Stream] Skipping segment 1/${segmentsToSkip}`)
        pendingExtInf = '' // Clear the pending EXTINF for first segment
        skippedSegments = 1
        continue
      } else if (!selectedAd || selectedAd.segments.length === 0) {
        console.log(`[Stream] No ads available for quality ${quality}`)
        // No ad, so add the first segment normally
        if (pendingExtInf) {
          result.push(pendingExtInf)
          pendingExtInf = ''
        }
      }
    }

    // Handle other comment lines (not EXTINF, those are handled separately)
    if (line.startsWith('#') && !line.startsWith('#EXTINF:')) {
      result.push(line)
    } else if (line.trim() !== '' && !line.startsWith('#')) {
      // This is a segment URL

      // Skip segments if we need to
      if (adInjected && skippedSegments < segmentsToSkip) {
        skippedSegments++
        console.log(`[Stream] Skipping segment ${skippedSegments}/${segmentsToSkip}`)
        pendingExtInf = '' // Clear the pending EXTINF
        continue
      }

      segmentCount++
      console.log(`[Stream] Adding video segment ${segmentCount}: ${line.substring(0, 50)}...`)

      // Add the pending EXTINF before this segment
      if (pendingExtInf) {
        result.push(pendingExtInf)
        pendingExtInf = ''
      }

      // Convert relative URLs to absolute and apply CORS proxy if enabled
      let segmentUrl: string
      if (line.startsWith('http')) {
        segmentUrl = line
      } else {
        segmentUrl = `${baseUrlObj.origin}${basePath}/${line.trim()}`
      }

      // Prepend CORS proxy if enabled (for all external URLs, not our API)
      const isOwnApi = segmentUrl.includes(process.env.NEXTAUTH_URL || 'md8av.com')
      if (corsProxyEnabled && !isOwnApi) {
        segmentUrl = `${corsProxyUrl}${segmentUrl}`
      }

      result.push(segmentUrl)
    }
  }

  console.log(`[Stream] Final m3u8 has ${segmentCount} video segments`)
  return result.join('\n')
}