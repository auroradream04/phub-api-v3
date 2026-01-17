import { getSiteSettings, SETTING_KEYS, getAdSettings } from './site-settings'
import { calculateAdPlacements, calculateM3u8Duration, assignAdsToplacements } from './ad-placement'
import {
  probeVideoFormat,
  getAdVariantForFormat,
  isDefaultFormat,
  DEFAULT_FORMAT,
  type VideoFormat
} from './ad-transcoder'

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
  skipFormatDetection?: boolean // Skip format detection (use default format)
}

export interface ProcessedM3u8Result {
  content: string
  duration: number
  segmentCount: number
  adsInjected: number
  detectedFormat?: VideoFormat
  transcodedAds?: boolean
  cdnAdsStripped?: number
}

/**
 * Detect and strip existing CDN pre-roll ads from m3u8 playlist
 *
 * CDN ads typically have this pattern:
 * 1. #EXT-X-KEY:METHOD=NONE (or no key) - unencrypted ad segments
 * 2. Some segments (the ad)
 * 3. #EXT-X-DISCONTINUITY
 * 4. #EXT-X-KEY:METHOD=AES-128 - encrypted video
 * 5. Actual video segments
 *
 * Returns the cleaned m3u8 and count of stripped ad segments
 */
function stripCdnPrerollAds(m3u8Content: string): {
  content: string
  strippedSegments: number
} {
  const lines = m3u8Content.split('\n')

  // Find the first DISCONTINUITY
  let firstDiscontinuityIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '#EXT-X-DISCONTINUITY') {
      firstDiscontinuityIndex = i
      break
    }
  }

  // No discontinuity = no CDN ad pattern
  if (firstDiscontinuityIndex === -1) {
    return { content: m3u8Content, strippedSegments: 0 }
  }

  // Check what comes after the discontinuity
  // We're looking for: DISCONTINUITY followed by encryption key (METHOD=AES-128)
  let hasEncryptionAfterDiscontinuity = false
  for (let i = firstDiscontinuityIndex + 1; i < lines.length && i < firstDiscontinuityIndex + 5; i++) {
    if (lines[i].includes('#EXT-X-KEY:') && lines[i].includes('METHOD=AES-128')) {
      hasEncryptionAfterDiscontinuity = true
      break
    }
  }

  // Check if content before discontinuity is unencrypted or has METHOD=NONE
  let isUnencryptedBeforeDiscontinuity = true
  for (let i = 0; i < firstDiscontinuityIndex; i++) {
    if (lines[i].includes('#EXT-X-KEY:') && lines[i].includes('METHOD=AES-128')) {
      isUnencryptedBeforeDiscontinuity = false
      break
    }
  }

  // CDN ad pattern: unencrypted before DISCONTINUITY, encrypted after
  if (!isUnencryptedBeforeDiscontinuity || !hasEncryptionAfterDiscontinuity) {
    return { content: m3u8Content, strippedSegments: 0 }
  }

  // Count segments being stripped (before discontinuity)
  let strippedSegments = 0
  for (let i = 0; i < firstDiscontinuityIndex; i++) {
    if (lines[i].startsWith('#EXTINF:')) {
      strippedSegments++
    }
  }

  // Only strip if it looks like a reasonable ad (< 60 seconds worth, assuming ~3s segments)
  if (strippedSegments > 20) {
    console.log(`[M3u8Processor] Found ${strippedSegments} segments before DISCONTINUITY - too many for an ad, skipping strip`)
    return { content: m3u8Content, strippedSegments: 0 }
  }

  console.log(`[M3u8Processor] Detected CDN pre-roll ad: ${strippedSegments} segments, stripping...`)

  // Build new m3u8 without the CDN ad
  const result: string[] = []
  let skipUntilDiscontinuity = false
  let foundFirstDiscontinuity = false
  let skippingInitialKey = true

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Copy header tags always
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

    // Skip the initial METHOD=NONE key
    if (skippingInitialKey && line.includes('#EXT-X-KEY:') && line.includes('METHOD=NONE')) {
      continue
    }

    // Once we hit the first DISCONTINUITY, stop skipping
    if (!foundFirstDiscontinuity && line.trim() === '#EXT-X-DISCONTINUITY') {
      foundFirstDiscontinuity = true
      skipUntilDiscontinuity = false
      // Don't include the DISCONTINUITY itself - our ad will add one
      continue
    }

    // Skip content before first discontinuity (the CDN ad)
    if (!foundFirstDiscontinuity) {
      continue
    }

    // After discontinuity, include everything
    skippingInitialKey = false
    result.push(line)
  }

  return {
    content: result.join('\n'),
    strippedSegments
  }
}

/**
 * Extract the first segment URL from an m3u8 playlist
 */
function extractFirstSegmentUrl(m3u8Content: string, baseUrl: string): string | null {
  const lines = m3u8Content.split('\n')
  const baseUrlObj = new URL(baseUrl)
  const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/'))

  for (const line of lines) {
    // Skip tags and empty lines
    if (line.startsWith('#') || line.trim() === '') continue

    const trimmedLine = line.trim()

    // Found a segment URL
    if (trimmedLine.startsWith('http')) {
      return trimmedLine
    } else if (trimmedLine.startsWith('/')) {
      return `${baseUrlObj.origin}${trimmedLine}`
    } else {
      return `${baseUrlObj.origin}${basePath}/${trimmedLine}`
    }
  }

  return null
}

/**
 * Cache for ad variants - maps adId -> formatKey -> variant info
 */
const adVariantCache = new Map<string, Map<string, { segments: string[], formatKey: string }>>()

/**
 * Get or prepare ad variant for the target format
 */
async function prepareAdVariant(
  adId: string,
  targetFormat: VideoFormat
): Promise<{ segments: string[], formatKey: string } | null> {
  // Check cache first
  const adCache = adVariantCache.get(adId)
  if (adCache?.has(targetFormat.formatKey)) {
    return adCache.get(targetFormat.formatKey)!
  }

  // Get or create variant
  const result = await getAdVariantForFormat(adId, targetFormat)

  if (!result.success) {
    console.log(`[M3u8Processor] Failed to prepare ad variant for ${adId} at ${targetFormat.formatKey}`)
    return null
  }

  // Cache it
  if (!adVariantCache.has(adId)) {
    adVariantCache.set(adId, new Map())
  }
  adVariantCache.get(adId)!.set(targetFormat.formatKey, {
    segments: result.segments,
    formatKey: result.formatKey
  })

  return { segments: result.segments, formatKey: result.formatKey }
}

/**
 * Process an m3u8 playlist: inject ads and rewrite segment URLs
 *
 * This is a generalized version that can work with any m3u8 source,
 * not just internal PornHub videos.
 */
export async function processM3u8(options: M3u8ProcessorOptions): Promise<ProcessedM3u8Result> {
  const {
    m3u8Content: rawM3u8Content,
    baseUrl,
    videoId = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    segmentProxyMode: requestedMode,
    segmentProxyUrl,
    corsProxyUrl: overrideCorsProxyUrl,
    adsEnabled = true,
    segmentsToSkip: overrideSegmentsToSkip,
    skipFormatDetection = false,
  } = options

  // Strip existing CDN pre-roll ads before processing
  const { content: m3u8Content, strippedSegments: cdnAdsStripped } = stripCdnPrerollAds(rawM3u8Content)

  if (cdnAdsStripped > 0) {
    console.log(`[M3u8Processor] Stripped ${cdnAdsStripped} CDN ad segments`)
  }

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

  // Detect video format for ad matching (if we have ads to inject)
  let detectedFormat: VideoFormat = DEFAULT_FORMAT
  let transcodedAds = false

  if (placements.some(p => p.selectedAd) && !skipFormatDetection) {
    // Extract first segment URL
    const firstSegmentUrl = extractFirstSegmentUrl(m3u8Content, baseUrl)

    if (firstSegmentUrl) {
      // Apply CORS proxy if needed for probing
      const probeUrl = segmentProxyMode === 'cors'
        ? `${corsProxyUrl}${firstSegmentUrl}`
        : firstSegmentUrl

      console.log(`[M3u8Processor] Probing video format from: ${firstSegmentUrl.substring(0, 80)}...`)

      const probedFormat = await probeVideoFormat(probeUrl)

      if (probedFormat) {
        detectedFormat = probedFormat
        console.log(`[M3u8Processor] Detected format: ${detectedFormat.formatKey}`)

        // Prepare ad variants for all unique ads if format differs from default
        if (!isDefaultFormat(detectedFormat)) {
          const uniqueAdIds = new Set(
            placements
              .filter(p => p.selectedAd)
              .map(p => p.selectedAd!.id)
          )

          console.log(`[M3u8Processor] Need to prepare ${uniqueAdIds.size} ad variant(s) for ${detectedFormat.formatKey}`)

          for (const adId of uniqueAdIds) {
            const variant = await prepareAdVariant(adId, detectedFormat)
            if (variant) {
              transcodedAds = true
            }
          }
        }
      } else {
        console.log(`[M3u8Processor] Could not probe format, using default`)
      }
    }
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
  let deferredEncryptionKey = '' // Defer encryption key until after pre-roll ad

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
          const adId = placement.selectedAd.id
          const baseApiUrl = process.env.NEXTAUTH_URL || 'http://md8av.com'

          // Check if we need to use a variant (non-default format)
          let adUrl: string

          if (!isDefaultFormat(detectedFormat)) {
            // Try to get the cached variant
            const variantInfo = adVariantCache.get(adId)?.get(detectedFormat.formatKey)

            if (variantInfo && variantInfo.segments.length > 0) {
              // Use variant segment
              const randomIndex = Math.floor(Math.random() * variantInfo.segments.length)
              adUrl = `${baseApiUrl}/api/ads/serve/${adId}/${randomIndex}/variant?format=${encodeURIComponent(detectedFormat.formatKey)}&v=${videoId}`
            } else {
              // Fallback to original (variant creation failed)
              const randomSegment = placement.selectedAd.segments[
                Math.floor(Math.random() * placement.selectedAd.segments.length)
              ] as { quality: number | string }
              adUrl = `${baseApiUrl}/api/ads/serve/${adId}/${randomSegment.quality}.ts?v=${videoId}`
            }
          } else {
            // Use original ad (format matches)
            const randomSegment = placement.selectedAd.segments[
              Math.floor(Math.random() * placement.selectedAd.segments.length)
            ] as { quality: number | string }
            adUrl = `${baseApiUrl}/api/ads/serve/${adId}/${randomSegment.quality}.ts?v=${videoId}`
          }

          // Add ad segment with proper encryption handling
          // 1. Mark as unencrypted (our ad is not encrypted)
          result.push('#EXT-X-KEY:METHOD=NONE')
          result.push('#EXTINF:3.0,')
          result.push(adUrl)
          result.push('#EXT-X-DISCONTINUITY')

          // 2. Output the deferred encryption key (video is encrypted)
          if (deferredEncryptionKey) {
            result.push(deferredEncryptionKey)
            deferredEncryptionKey = '' // Clear it after using
          }

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
      const trimmedLine = line.trim()
      if (trimmedLine.startsWith('http')) {
        segmentUrl = trimmedLine
      } else if (trimmedLine.startsWith('/')) {
        // Absolute path - use origin only
        segmentUrl = `${baseUrlObj.origin}${trimmedLine}`
      } else {
        // Relative path - resolve against current directory
        segmentUrl = `${baseUrlObj.origin}${basePath}/${trimmedLine}`
      }

      // Apply proxy based on mode
      segmentUrl = applySegmentProxy(segmentUrl, segmentProxyMode, corsProxyUrl, segmentProxyUrl)

      result.push(segmentUrl)
      segmentCount++
    } else if (line.startsWith('#EXT-X-KEY:')) {
      // Rewrite encryption key URI to absolute URL
      const rewrittenKey = rewriteKeyUri(line, baseUrlObj, basePath, segmentProxyMode, corsProxyUrl)

      // If we have a pre-roll ad that hasn't been injected yet, defer the encryption key
      // so we can output METHOD=NONE for the ad first
      const prerollPlacement = placements.find(p => p.type === 'pre-roll' && p.selectedAd && !p.injected)
      const isAes128 = rewrittenKey.includes('METHOD=AES-128')

      if (prerollPlacement && isAes128) {
        console.log(`[M3u8Processor] Deferring encryption key for pre-roll ad`)
        deferredEncryptionKey = rewrittenKey
        // Don't output yet - will be output after ad injection
      } else {
        result.push(rewrittenKey)
      }
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
    detectedFormat,
    transcodedAds,
    cdnAdsStripped,
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
 * Rewrite #EXT-X-KEY URI to absolute URL
 * Example: #EXT-X-KEY:METHOD=AES-128,URI="/path/key.key"
 * Becomes: #EXT-X-KEY:METHOD=AES-128,URI="https://cdn.com/path/key.key"
 */
function rewriteKeyUri(
  line: string,
  baseUrlObj: URL,
  basePath: string,
  mode: SegmentProxyMode,
  corsProxyUrl: string
): string {
  // Match URI="..." or URI='...'
  const uriMatch = line.match(/URI="([^"]+)"|URI='([^']+)'/)
  if (!uriMatch) return line

  const originalUri = uriMatch[1] || uriMatch[2]

  // Skip if already absolute
  if (originalUri.startsWith('http')) {
    // Still might need CORS proxy
    if (mode === 'cors') {
      const proxiedUri = `${corsProxyUrl}${originalUri}`
      return line.replace(originalUri, proxiedUri)
    }
    return line
  }

  // Resolve relative/absolute path
  let absoluteUri: string
  if (originalUri.startsWith('/')) {
    absoluteUri = `${baseUrlObj.origin}${originalUri}`
  } else {
    absoluteUri = `${baseUrlObj.origin}${basePath}/${originalUri}`
  }

  // Apply CORS proxy if needed
  if (mode === 'cors') {
    absoluteUri = `${corsProxyUrl}${absoluteUri}`
  }

  return line.replace(originalUri, absoluteUri)
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
        const trimmedLine = nextLine.trim()
        if (trimmedLine.startsWith('http')) {
          return trimmedLine
        } else {
          const baseUrlObj = new URL(baseUrl)
          // Check if it's an absolute path (starts with /)
          if (trimmedLine.startsWith('/')) {
            return `${baseUrlObj.origin}${trimmedLine}`
          }
          // Relative path - resolve against current directory
          const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/'))
          return `${baseUrlObj.origin}${basePath}/${trimmedLine}`
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

        const trimmedLine = nextLine.trim()
        let url: string
        if (trimmedLine.startsWith('http')) {
          url = trimmedLine
        } else {
          const baseUrlObj = new URL(baseUrl)
          // Check if it's an absolute path (starts with /)
          if (trimmedLine.startsWith('/')) {
            url = `${baseUrlObj.origin}${trimmedLine}`
          } else {
            // Relative path - resolve against current directory
            const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/'))
            url = `${baseUrlObj.origin}${basePath}/${trimmedLine}`
          }
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
