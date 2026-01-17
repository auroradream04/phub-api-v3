import { getSiteSettings, SETTING_KEYS, getAdSettings } from './site-settings'
import { calculateAdPlacements, calculateM3u8Duration, assignAdsToplacements } from './ad-placement'

export type SegmentProxyMode = 'cors' | 'full' | 'passthrough'

export interface M3u8ProcessorOptions {
  m3u8Content: string
  baseUrl: string              // For resolving relative URLs
  videoId?: string             // For ad tracking (optional for external streams)
  segmentProxyMode?: SegmentProxyMode  // Default: from settings or 'cors'
  segmentProxyUrl?: string     // For 'full' mode - base URL for segment proxy
  corsProxyUrl?: string        // Override CORS proxy URL
  adsEnabled?: boolean         // Default: true
  segmentsToSkip?: number      // Override segments to skip
}

export interface ProcessedM3u8Result {
  content: string
  duration: number
  segmentCount: number
  adsInjected: number
}

/**
 * Process an m3u8 playlist: inject ads and rewrite segment URLs
 *
 * This is a generalized version that can work with any m3u8 source,
 * not just internal PornHub videos.
 */
export async function processM3u8(options: M3u8ProcessorOptions): Promise<ProcessedM3u8Result> {
  const {
    m3u8Content,
    baseUrl,
    videoId = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    segmentProxyMode: requestedMode,
    segmentProxyUrl,
    corsProxyUrl: overrideCorsProxyUrl,
    adsEnabled = true,
    segmentsToSkip: overrideSegmentsToSkip,
  } = options

  const lines = m3u8Content.split('\n')
  const result: string[] = []
  const baseUrlObj = new URL(baseUrl)
  const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/'))

  // Get settings (will use cached values if available)
  const [streamSettings, adSettings] = await Promise.all([
    getSiteSettings(
      [
        SETTING_KEYS.CORS_PROXY_ENABLED,
        SETTING_KEYS.CORS_PROXY_URL,
        SETTING_KEYS.SEGMENTS_TO_SKIP,
        'proxy_segment_mode', // New setting for default mode
      ],
      {
        [SETTING_KEYS.CORS_PROXY_ENABLED]: 'true',
        [SETTING_KEYS.CORS_PROXY_URL]: 'https://cors.freechatnow.net/',
        [SETTING_KEYS.SEGMENTS_TO_SKIP]: '3',
        'proxy_segment_mode': 'cors',
      }
    ),
    adsEnabled ? getAdSettings() : Promise.resolve(null),
  ])

  // Determine segment proxy mode
  const segmentProxyMode: SegmentProxyMode = requestedMode ||
    (streamSettings['proxy_segment_mode'] as SegmentProxyMode) ||
    'cors'

  const corsProxyUrl = overrideCorsProxyUrl || streamSettings[SETTING_KEYS.CORS_PROXY_URL]
  const segmentsToSkip = overrideSegmentsToSkip ?? parseInt(streamSettings[SETTING_KEYS.SEGMENTS_TO_SKIP])

  // Calculate video duration from M3U8
  const videoDurationSeconds = calculateM3u8Duration(m3u8Content)

  // Calculate ad placements if ads are enabled
  let placements: Awaited<ReturnType<typeof assignAdsToplacements>> = []
  if (adsEnabled && adSettings) {
    const calculatedPlacements = calculateAdPlacements(videoDurationSeconds, adSettings)
    placements = await assignAdsToplacements(calculatedPlacements)
  }

  // Check if we have a pre-roll ad
  const hasPreroll = placements.some(p => p.type === 'pre-roll' && p.selectedAd)

  // Create a map of time percentages to placements for quick lookup
  const placementMap = new Map<number, typeof placements[0]>()
  for (const placement of placements) {
    placementMap.set(placement.percentageOfVideo, placement)
  }

  // Processing state
  let pendingExtInf = ''
  let segmentCount = 0
  let totalSegmentsEstimate = 0
  let skippedSegments = 0
  let adsInjected = 0

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
      // Check if we need to inject ads before this segment
      const progressPercentage = (segmentCount / Math.max(totalSegmentsEstimate, 1)) * 100
      const currentTimePercentage = Math.round(progressPercentage)

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
          adsInjected++
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

      // Convert relative URLs to absolute
      let segmentUrl: string
      if (line.startsWith('http')) {
        segmentUrl = line
      } else {
        segmentUrl = `${baseUrlObj.origin}${basePath}/${line.trim()}`
      }

      // Apply proxy based on mode
      segmentUrl = applySegmentProxy(segmentUrl, segmentProxyMode, corsProxyUrl, segmentProxyUrl)

      result.push(segmentUrl)
      segmentCount++
    } else if (line.startsWith('#') && !line.startsWith('#EXTINF:')) {
      // Copy other tags (except #EXT-X-ENDLIST which we'll add at the end if needed)
      if (line.trim() === '#EXT-X-ENDLIST') {
        continue // Skip for now, add at end
      }
      result.push(line)
    }
  }

  // Add end tag if original had it
  if (m3u8Content.includes('#EXT-X-ENDLIST')) {
    result.push('#EXT-X-ENDLIST')
  }

  return {
    content: result.join('\n'),
    duration: videoDurationSeconds,
    segmentCount,
    adsInjected,
  }
}

/**
 * Apply segment proxy based on mode
 */
function applySegmentProxy(
  segmentUrl: string,
  mode: SegmentProxyMode,
  corsProxyUrl: string,
  segmentProxyUrl?: string
): string {
  const isOwnApi = segmentUrl.includes(process.env.NEXTAUTH_URL || 'md8av.com')

  // Don't proxy our own URLs
  if (isOwnApi) {
    return segmentUrl
  }

  switch (mode) {
    case 'cors':
      // Use external CORS proxy
      return `${corsProxyUrl}${segmentUrl}`

    case 'full':
      // Route through our own segment proxy
      const proxyBase = segmentProxyUrl || `${process.env.NEXTAUTH_URL || 'http://md8av.com'}/api/stream/segment`
      return `${proxyBase}?url=${encodeURIComponent(segmentUrl)}`

    case 'passthrough':
      // No modification
      return segmentUrl

    default:
      return segmentUrl
  }
}

/**
 * Check if an m3u8 is a master playlist (contains variant streams)
 */
export function isMasterPlaylist(m3u8Text: string): boolean {
  return m3u8Text.includes('#EXT-X-STREAM-INF')
}

/**
 * Extract the first variant URL from a master playlist
 */
export function extractFirstVariantUrl(m3u8Text: string, baseUrl: string): string | null {
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

/**
 * Extract all variant URLs from a master playlist with their bandwidth info
 */
export function extractAllVariants(m3u8Text: string, baseUrl: string): Array<{
  url: string
  bandwidth?: number
  resolution?: string
}> {
  const lines = m3u8Text.split('\n')
  const variants: Array<{ url: string; bandwidth?: number; resolution?: string }> = []

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const nextLine = lines[i + 1]
      if (nextLine && nextLine.trim() !== '') {
        // Parse bandwidth and resolution from STREAM-INF
        const bandwidthMatch = lines[i].match(/BANDWIDTH=(\d+)/)
        const resolutionMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/)

        let url: string
        if (nextLine.startsWith('http')) {
          url = nextLine.trim()
        } else {
          const baseUrlObj = new URL(baseUrl)
          const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/'))
          url = `${baseUrlObj.origin}${basePath}/${nextLine.trim()}`
        }

        variants.push({
          url,
          bandwidth: bandwidthMatch ? parseInt(bandwidthMatch[1]) : undefined,
          resolution: resolutionMatch ? resolutionMatch[1] : undefined,
        })
      }
    }
  }

  return variants
}
