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
  proxyIndex?: number           // Proxy list index for consistent CDN token validation
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
 * Extract segment URL path to identify segment sources
 * Used to detect when ads (different URL source) are present
 */
function extractSegmentPath(segmentUrl: string): string {
  try {
    const url = new URL(segmentUrl.startsWith('http') ? segmentUrl : `https://example.com${segmentUrl}`)
    // Extract the path up to the filename
    return url.pathname.substring(0, url.pathname.lastIndexOf('/'))
  } catch {
    return segmentUrl
  }
}

/**
 * Extract original URL from a proxied segment URL
 * Example: https://md8av.com/api/stream/segment?url=https%3A%2F%2Fv2025.sysybf.com%2F20260201%2F...
 * Returns: https://v2025.sysybf.com/20260201/...
 */
function extractOriginalUrl(segmentUrl: string): string {
  try {
    // If it's already a direct URL (not proxied), return as-is
    if (!segmentUrl.includes('?url=')) {
      return segmentUrl
    }

    // Extract the url= parameter value
    const urlMatch = segmentUrl.match(/[\?&]url=([^&]+)/)
    if (urlMatch && urlMatch[1]) {
      return decodeURIComponent(urlMatch[1])
    }
  } catch {
    // Fallback to original
  }
  return segmentUrl
}

/**
 * Detect and strip existing CDN ads from m3u8 playlist
 *
 * Ads are identified by:
 * 1. DISCONTINUITY markers separate ad sections from main video
 * 2. Different segment URL sources (ads from different CDN paths)
 * 3. Small segment counts (ads typically < 20 segments, ~60 seconds)
 *
 * Strips ALL ad instances (pre-roll, mid-roll, post-roll) so they can be
 * replaced with your own ads via the ad injection system.
 *
 * Returns the cleaned m3u8 and count of stripped ad segments
 */
function stripCdnPrerollAds(m3u8Content: string): {
  content: string
  strippedSegments: number
} {
  const lines = m3u8Content.split('\n')

  // Parse into sections separated by DISCONTINUITY markers
  interface Section {
    startIndex: number
    endIndex: number
    segmentCount: number
    segmentPaths: Set<string>
  }

  const sections: Section[] = []
  let currentSection: Section | null = null
  let currentSegmentPaths = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.trim() === '#EXT-X-DISCONTINUITY') {
      // Save current section
      if (currentSection) {
        currentSection.endIndex = i
        currentSection.segmentPaths = currentSegmentPaths
        sections.push(currentSection)
      }
      // Start new section
      currentSection = {
        startIndex: i + 1,
        endIndex: lines.length,
        segmentCount: 0,
        segmentPaths: new Set()
      }
      currentSegmentPaths = new Set<string>()
    } else if (currentSection && line.startsWith('#EXTINF:')) {
      currentSection.segmentCount++
      // Look ahead for the segment URL
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1]
        if (!nextLine.startsWith('#')) {
          // Extract original URL first (handles proxied URLs like ?url=...)
          const originalUrl = extractOriginalUrl(nextLine)
          currentSegmentPaths.add(extractSegmentPath(originalUrl))
        }
      }
    }
  }

  // Save final section
  if (currentSection) {
    currentSection.endIndex = lines.length
    currentSection.segmentPaths = currentSegmentPaths
    sections.push(currentSection)
  }

  // If no sections found, return as-is
  if (sections.length === 0) {
    return { content: m3u8Content, strippedSegments: 0 }
  }

  // Identify main video section (largest segment count)
  const mainVideoSection = sections.reduce((max, section) =>
    section.segmentCount > max.segmentCount ? section : max
  )

  // Find and mark ad sections to strip
  const sectionsToStrip = new Set<number>()
  let totalStrippedSegments = 0

  for (let idx = 0; idx < sections.length; idx++) {
    const section = sections[idx]

    // Skip if it's the main video section
    if (section === mainVideoSection) {
      console.log(`[M3u8Processor] Section ${idx}: MAIN VIDEO (${section.segmentCount} segments)`)
      continue
    }

    // If segment count is small (< 20, likely an ad) or URL path differs from main video, strip it
    const isSmallSegmentCount = section.segmentCount < 20
    const isDifferentSource = section.segmentPaths.size > 0 &&
      mainVideoSection.segmentPaths.size > 0 &&
      !Array.from(section.segmentPaths).some(path => mainVideoSection.segmentPaths.has(path))

    console.log(`[M3u8Processor] Section ${idx}: ${section.segmentCount} segments (small: ${isSmallSegmentCount}, different: ${isDifferentSource})`)
    console.log(`  This section paths: ${Array.from(section.segmentPaths).join(', ')}`)
    console.log(`  Main video paths: ${Array.from(mainVideoSection.segmentPaths).join(', ')}`)

    if (isSmallSegmentCount || isDifferentSource) {
      sectionsToStrip.add(idx)
      totalStrippedSegments += section.segmentCount
      console.log(`[M3u8Processor]  → STRIPPING`)
    }
  }

  // If no ads detected, return as-is
  if (sectionsToStrip.size === 0) {
    return { content: m3u8Content, strippedSegments: 0 }
  }

  console.log(`[M3u8Processor] Stripping ${totalStrippedSegments} ad segments from ${sectionsToStrip.size} section(s)`)

  // Build new m3u8 without ad sections
  const result: string[] = []
  let currentSectionIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Always include header tags
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

    // Track which section we're in
    if (line.trim() === '#EXT-X-DISCONTINUITY') {
      currentSectionIdx++
      // Skip DISCONTINUITY markers from stripped sections
      if (sectionsToStrip.has(currentSectionIdx)) {
        continue
      }
      // For non-stripped sections, keep the DISCONTINUITY marker
      result.push(line)
      continue
    }

    // Skip content in ad sections
    if (sectionsToStrip.has(currentSectionIdx)) {
      continue
    }

    // Include everything else
    result.push(line)
  }

  return {
    content: result.join('\n'),
    strippedSegments: totalStrippedSegments
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
 * Cache for detected video formats - maps videoId -> VideoFormat (2h TTL)
 * Avoids re-downloading 512KB + running ffprobe on every cache miss
 */
const FORMAT_CACHE_TTL = 2 * 60 * 60 * 1000 // 2 hours
interface CachedFormat {
  format: VideoFormat
  cachedAt: number
}
const formatCache = new Map<string, CachedFormat>()

function getCachedFormat(videoId: string): VideoFormat | null {
  const cached = formatCache.get(videoId)
  if (!cached) return null
  if (Date.now() - cached.cachedAt > FORMAT_CACHE_TTL) {
    formatCache.delete(videoId)
    return null
  }
  return cached.format
}

function setCachedFormat(videoId: string, format: VideoFormat): void {
  // Cap cache size
  if (formatCache.size >= 1000) {
    const oldestKey = formatCache.keys().next().value
    if (oldestKey) formatCache.delete(oldestKey)
  }
  formatCache.set(videoId, { format, cachedAt: Date.now() })
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
    proxyIndex,
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

  const hasAdsToInject = placements.some(p => p.selectedAd)

  if (hasAdsToInject && !skipFormatDetection) {
    // Check format cache first (avoids 512KB download + ffprobe)
    const cachedFormat = getCachedFormat(videoId)

    if (cachedFormat) {
      detectedFormat = cachedFormat
      console.log(`[M3u8Processor] ✓ Format cache hit: ${detectedFormat.formatKey}`)
    } else {
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
          setCachedFormat(videoId, detectedFormat)
          console.log(`[M3u8Processor] Detected format: ${detectedFormat.formatKey}`)
        } else {
          console.log(`[M3u8Processor] Could not probe format, using default`)
        }
      }
    }

    // Prepare ad variants if format differs from default
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
      segmentUrl = applySegmentProxy(segmentUrl, segmentProxyMode, corsProxyUrl, segmentProxyUrl, proxyIndex)

      result.push(segmentUrl)
      segmentCount++
    } else if (line.startsWith('#EXT-X-KEY:')) {
      // Rewrite encryption key URI to absolute URL
      const rewrittenKey = rewriteKeyUri(line, baseUrlObj, basePath, segmentProxyMode, corsProxyUrl, segmentProxyUrl, proxyIndex)

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
  segmentProxyUrl?: string,
  proxyIndex?: number
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

    case 'full': {
      // Route through our own segment proxy
      const proxyBase = segmentProxyUrl || `${process.env.NEXTAUTH_URL || 'http://md8av.com'}/api/stream/segment`
      let fullUrl = `${proxyBase}?url=${encodeURIComponent(segmentUrl)}`
      if (proxyIndex !== undefined && proxyIndex >= 0) fullUrl += `&px=${proxyIndex}`
      return fullUrl
    }

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
  corsProxyUrl: string,
  segmentProxyUrl?: string,
  proxyIndex?: number
): string {
  // Match URI="..." or URI='...'
  const uriMatch = line.match(/URI="([^"]+)"|URI='([^']+)'/)
  if (!uriMatch) return line

  const originalUri = uriMatch[1] || uriMatch[2]

  // Resolve to absolute URL first
  let absoluteUri: string
  if (originalUri.startsWith('http')) {
    absoluteUri = originalUri
  } else if (originalUri.startsWith('/')) {
    absoluteUri = `${baseUrlObj.origin}${originalUri}`
  } else {
    absoluteUri = `${baseUrlObj.origin}${basePath}/${originalUri}`
  }

  // Apply proxy based on mode
  if (mode === 'cors') {
    absoluteUri = `${corsProxyUrl}${absoluteUri}`
  } else if (mode === 'full') {
    const proxyBase = segmentProxyUrl || `${process.env.NEXTAUTH_URL || 'http://md8av.com'}/api/stream/segment`
    absoluteUri = `${proxyBase}?url=${encodeURIComponent(absoluteUri)}`
    if (proxyIndex !== undefined && proxyIndex >= 0) absoluteUri += `&px=${proxyIndex}`
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
