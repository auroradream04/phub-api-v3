import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { getSiteSetting, SETTING_KEYS, getAdSettings } from '@/lib/site-settings'
import { checkAndLogDomain } from '@/lib/domain-middleware'
import { calculateAdPlacements, calculateM3u8Duration, assignAdsToplacements } from '@/lib/ad-placement'

export const revalidate = 7200 // 2 hours

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
    while (retries > 0 && !videoInfo) {
      // Select proxy BEFORE making request
      const proxyInfo = getRandomProxy('Stream API')

      if (!proxyInfo) {
        console.error('[Stream API] No proxy available from proxy list')
        break
      }

      pornhub.setAgent(proxyInfo.agent)

      const startTime = Date.now()
      try {
        const response = await pornhub.video(id)
        const duration = Date.now() - startTime

        // Check for soft blocking (missing media definitions)
        if (!response.mediaDefinitions || response.mediaDefinitions.length < 1) {
          console.warn(`[Stream API] Proxy ${proxyInfo.proxyUrl} returned video without media definitions (${duration}ms) - likely blocked`)
          // Try different proxy
        } else {
          console.log(`[Stream API] ✓ Success with proxy ${proxyInfo.proxyUrl} (${duration}ms, ${response.mediaDefinitions.length} qualities available)`)
          videoInfo = response
        }
      } catch (error: unknown) {
        const duration = Date.now() - startTime
        console.error(`[Stream API] Proxy ${proxyInfo.proxyUrl} failed (${duration}ms):`, error instanceof Error ? error.message : error)
        // Try different proxy
      }

      retries--    }

    if (!videoInfo || !videoInfo.mediaDefinitions || videoInfo.mediaDefinitions.length < 1) {
      await domainCheck.logRequest(500, Date.now() - requestStart)
      console.error('[Stream API] ❌ All proxy attempts failed - could not fetch video information')
      throw new Error('Failed to fetch video information')
    }

    const mediaDefinition = videoInfo.mediaDefinitions.find(
      (md) => md.quality.toString() === quality
    )

    if (!mediaDefinition) {
      await domainCheck.logRequest(404, Date.now() - requestStart)
      console.warn(`[Stream API] Quality ${quality}p not found for video ${id}. Available qualities: ${videoInfo.mediaDefinitions.map(md => md.quality).join(', ')}`)
      return NextResponse.json(
        { error: `Quality ${quality} not found` },
        { status: 404 }
      )
    }

    const originalM3u8Url = mediaDefinition.videoUrl
    console.log(`[Stream API] Fetching m3u8 playlist from: ${originalM3u8Url}`)

    const m3u8Response = await fetch(originalM3u8Url)

    if (!m3u8Response.ok) {
      console.error(`[Stream API] Failed to fetch m3u8 playlist: ${m3u8Response.status} ${m3u8Response.statusText}`)
      throw new Error(`Failed to fetch m3u8: ${m3u8Response.status}`)
    }

    const originalM3u8 = await m3u8Response.text()
    console.log(`[Stream API] M3u8 playlist fetched successfully (${originalM3u8.length} bytes)`)

    if (isMasterPlaylist(originalM3u8)) {
      console.log('[Stream API] Detected master playlist, extracting variant URL...')
      const variantUrl = extractFirstVariantUrl(originalM3u8, originalM3u8Url)

      if (!variantUrl) {
        console.error('[Stream API] Could not extract variant playlist URL from master playlist')
        throw new Error('Could not extract variant playlist URL')
      }

      console.log(`[Stream API] Fetching variant playlist from: ${variantUrl}`)
      const variantResponse = await fetch(variantUrl)

      if (!variantResponse.ok) {
        console.error(`[Stream API] Failed to fetch variant playlist: ${variantResponse.status} ${variantResponse.statusText}`)
        throw new Error(`Failed to fetch variant playlist: ${variantResponse.status}`)
      }

      const variantM3u8 = await variantResponse.text()
      console.log(`[Stream API] Variant playlist fetched (${variantM3u8.length} bytes), injecting ads...`)
      const modifiedM3u8 = await injectAds(variantM3u8, quality, variantUrl, id)

      await domainCheck.logRequest(200, Date.now() - requestStart)
      console.log(`[Stream API] ✓ Stream generated successfully for video ${id} (quality: ${quality}p, duration: ${Date.now() - requestStart}ms)`)

      return new Response(modifiedM3u8, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    console.log('[Stream API] Standard playlist detected, injecting ads...')
    const modifiedM3u8 = await injectAds(originalM3u8, quality, originalM3u8Url, id)

    // Log successful request
    await domainCheck.logRequest(200, Date.now() - requestStart)
    console.log(`[Stream API] ✓ Stream generated successfully for video ${id} (quality: ${quality}p, duration: ${Date.now() - requestStart}ms)`)

    return new Response(modifiedM3u8, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (error) {
    await domainCheck.logRequest(500, Date.now() - requestStart)
    console.error('[Stream API] ❌ Failed to generate stream:', error instanceof Error ? error.message : error)
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
  const baseUrlObj = new URL(baseUrl)
  const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/'))

  // Get CORS proxy settings
  const corsProxyEnabled = (await getSiteSetting(SETTING_KEYS.CORS_PROXY_ENABLED, 'true')) === 'true'
  const corsProxyUrl = await getSiteSetting(SETTING_KEYS.CORS_PROXY_URL, 'https://cors.freechatnow.net/')

  // Get segments to skip setting (for pre-roll: skip first X segments of original video)
  const segmentsToSkip = parseInt(await getSiteSetting(SETTING_KEYS.SEGMENTS_TO_SKIP, '3'))

  // Get ad settings
  const adSettings = await getAdSettings()

  // Calculate video duration from M3U8
  const videoDurationSeconds = calculateM3u8Duration(m3u8Text)

  // Calculate ad placements based on settings
  let placements = calculateAdPlacements(videoDurationSeconds, adSettings)

  // Assign ads to placements
  placements = await assignAdsToplacements(placements)

  // Check if we have a pre-roll ad
  const hasPreroll = placements.some(p => p.type === 'pre-roll' && p.selectedAd)

  // Create a map of time percentages to placements for quick lookup
  const placementMap = new Map<number, typeof placements[0]>()
  for (const placement of placements) {
    placementMap.set(placement.percentageOfVideo, placement)
  }

  // Copy header tags
  let headerComplete = false
  let pendingExtInf = ''
  let currentTimePercentage = 0
  let segmentCount = 0
  let totalSegmentsEstimate = 0
  // eslint-disable-next-line prefer-const
  let skippedSegments = 0

  // First pass: count total segments
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      totalSegmentsEstimate++
    }
  }

  // Second pass: build M3U8 with injected ads
  for (const line of lines) {
    // Copy header tags
    if (
      line.startsWith('#EXTM3U') ||
      line.startsWith('#EXT-X-VERSION') ||
      line.startsWith('#EXT-X-TARGETDURATION') ||
      line.startsWith('#EXT-X-MEDIA-SEQUENCE') ||
      line.startsWith('#EXT-X-PLAYLIST-TYPE') ||
      line.startsWith('#EXT-X-ALLOW-CACHE')
    ) {
      result.push(line)
      continue
    }

    // Store EXTINF temporarily
    if (line.startsWith('#EXTINF:')) {
      pendingExtInf = line
      continue
    }

    // Process segment URLs
    if (!line.startsWith('#') && line.trim() !== '') {
      if (!headerComplete) {
        headerComplete = true
      }

      // Check if we need to inject ads before this segment
      const progressPercentage = (segmentCount / Math.max(totalSegmentsEstimate, 1)) * 100
      currentTimePercentage = Math.round(progressPercentage)

      // Inject ads that should appear at or near this progress point
      for (const [percentage, placement] of placementMap.entries()) {
        // Check if this ad should be injected before current segment
        if (percentage <= currentTimePercentage && !placement.injected && placement.selectedAd) {
          // Select random ad segment
          const randomSegment = placement.selectedAd.segments[
            Math.floor(Math.random() * placement.selectedAd.segments.length)
          ] as { quality: number | string }

          // Add ad segment with videoId for tracking
          result.push('#EXTINF:3.0,')
          const adUrl = `${process.env.NEXTAUTH_URL || 'http://md8av.com'}/api/ads/serve/${placement.selectedAd.id}/${randomSegment.quality}.ts?v=${videoId}`
          result.push(adUrl)
          result.push('#EXT-X-DISCONTINUITY')

          // Mark as injected
          placement.injected = true
          // Impression is now tracked when segment is actually fetched
        }
      }

      // Skip first X segments of original video when pre-roll is present
      if (hasPreroll && skippedSegments < segmentsToSkip) {
        skippedSegments++
        pendingExtInf = '' // Clear the pending EXTINF since we're skipping this segment
        segmentCount++ // Still count for percentage calculation
        continue
      }

      // Add video segment
      if (pendingExtInf) {
        result.push(pendingExtInf)
        pendingExtInf = ''
      }

      // Convert relative URLs to absolute and apply CORS proxy
      let segmentUrl: string
      if (line.startsWith('http')) {
        segmentUrl = line
      } else {
        segmentUrl = `${baseUrlObj.origin}${basePath}/${line.trim()}`
      }

      // Apply CORS proxy if enabled
      const isOwnApi = segmentUrl.includes(process.env.NEXTAUTH_URL || 'md8av.com')
      if (corsProxyEnabled && !isOwnApi) {
        segmentUrl = `${corsProxyUrl}${segmentUrl}`
      }

      result.push(segmentUrl)
      segmentCount++
    } else if (line.startsWith('#') && !line.startsWith('#EXTINF:')) {
      // Copy other tags
      result.push(line)
    }
  }

  return result.join('\n')
}
