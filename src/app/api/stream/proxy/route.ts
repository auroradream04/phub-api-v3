import { NextRequest, NextResponse } from 'next/server'
import { processM3u8, isMasterPlaylist, extractFirstVariantUrl, SegmentProxyMode } from '@/lib/m3u8-processor'
import { getSiteSettings } from '@/lib/site-settings'

/**
 * Remove segments from beginning of m3u8 to skip initial ads
 * Removes segments until total duration >= trimSeconds
 */
function trimM3u8Start(m3u8Content: string, trimSeconds: number): string {
  if (trimSeconds <= 0) return m3u8Content

  const lines = m3u8Content.split('\n')
  let accumulatedDuration = 0
  let skipUntilLine = 0
  let currentExtinfLine = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Parse EXTINF lines which contain segment duration
    if (line.startsWith('#EXTINF:')) {
      currentExtinfLine = i
      // Extract duration: #EXTINF:3.337,
      const match = line.match(/#EXTINF:([\d.]+)/)
      if (match) {
        const duration = parseFloat(match[1])
        accumulatedDuration += duration

        // If we've accumulated enough duration, mark where to start keeping segments
        if (accumulatedDuration >= trimSeconds) {
          skipUntilLine = i // Keep this EXTINF and following segment
          break
        }
      }
    }
  }

  // If nothing to trim, return as-is
  if (skipUntilLine === 0) {
    return m3u8Content
  }

  // Keep header lines, skip to the first EXTINF we want to keep
  const headerEndIndex = lines.findIndex(line => line.startsWith('#EXTINF:'))
  const headerLines = lines.slice(0, headerEndIndex)
  const contentLines = lines.slice(skipUntilLine)

  return [...headerLines, ...contentLines].join('\n')
}

// In-memory cache for m3u8 responses (10 minute TTL - VOD content doesn't change)
const M3U8_CACHE_TTL = 10 * 60 * 1000
const MAX_CACHE_SIZE = 500

interface CachedM3u8 {
  content: string
  cachedAt: number
}

const m3u8Cache = new Map<string, CachedM3u8>()

function getCachedM3u8(cacheKey: string): string | null {
  const cached = m3u8Cache.get(cacheKey)
  if (!cached) return null

  if (Date.now() - cached.cachedAt > M3U8_CACHE_TTL) {
    m3u8Cache.delete(cacheKey)
    return null
  }

  return cached.content
}

function setCachedM3u8(cacheKey: string, content: string): void {
  if (m3u8Cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = m3u8Cache.keys().next().value
    if (oldestKey) m3u8Cache.delete(oldestKey)
  }

  m3u8Cache.set(cacheKey, { content, cachedAt: Date.now() })
}

// SSRF protection - block private IP ranges
const BLOCKED_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /localhost/i,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
]

function isUrlSafe(url: string): boolean {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname

    // Must be http or https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false
    }

    // Check against blocked patterns
    return !BLOCKED_PATTERNS.some(pattern => pattern.test(hostname))
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const requestStart = Date.now()

  try {
    const url = request.nextUrl.searchParams.get('url')
    const mode = request.nextUrl.searchParams.get('mode') as SegmentProxyMode | null
    const adsParam = request.nextUrl.searchParams.get('ads')
    const rawParam = request.nextUrl.searchParams.get('raw') === '1'
    const trimStartParam = request.nextUrl.searchParams.get('trimStart')
    const trimStartSeconds = trimStartParam ? parseInt(trimStartParam, 10) : 0

    if (!url) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      )
    }

    // Decode URL if it's encoded
    let decodedUrl: string
    try {
      decodedUrl = decodeURIComponent(url)
    } catch {
      decodedUrl = url
    }

    // SSRF protection
    if (!isUrlSafe(decodedUrl)) {
      console.warn(`[Stream Proxy] Blocked unsafe URL: ${decodedUrl}`)
      return NextResponse.json(
        { error: 'Invalid or blocked URL' },
        { status: 400 }
      )
    }

    // Check cache
    const cacheKey = `${decodedUrl}:${mode || 'default'}:${adsParam || 'true'}:${trimStartSeconds || '0'}`
    const cachedM3u8 = getCachedM3u8(cacheKey)
    if (cachedM3u8) {
      console.log(`[Stream Proxy] Cache hit for ${decodedUrl}`)
      return new Response(cachedM3u8, {
        headers: {
          'Content-Type': rawParam ? 'text/plain; charset=utf-8' : 'application/vnd.apple.mpegurl',
          'Cache-Control': 'public, max-age=600',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Get default settings
    const settings = await getSiteSettings(
      ['proxy_segment_mode', 'proxy_ads_enabled'],
      {
        'proxy_segment_mode': 'cors',
        'proxy_ads_enabled': 'true',
      }
    )

    const segmentProxyMode: SegmentProxyMode = mode || (settings['proxy_segment_mode'] as SegmentProxyMode) || 'cors'
    const adsEnabled = adsParam !== 'false' && settings['proxy_ads_enabled'] !== 'false'

    console.log(`[Stream Proxy] Fetching m3u8 from: ${decodedUrl}`)

    // Fetch the original m3u8
    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.pornhub.com/',
      },
    })

    if (!response.ok) {
      console.error(`[Stream Proxy] Failed to fetch m3u8: ${response.status} ${response.statusText}`)
      return NextResponse.json(
        { error: `Failed to fetch m3u8: ${response.status}` },
        { status: response.status }
      )
    }

    let m3u8Content = await response.text()
    let baseUrl = decodedUrl

    // If it's a master playlist, fetch the first variant
    if (isMasterPlaylist(m3u8Content)) {
      console.log('[Stream Proxy] Detected master playlist, extracting variant URL...')
      const variantUrl = extractFirstVariantUrl(m3u8Content, decodedUrl)

      if (!variantUrl) {
        console.error('[Stream Proxy] Could not extract variant playlist URL from master playlist')
        return NextResponse.json(
          { error: 'Could not extract variant playlist URL' },
          { status: 500 }
        )
      }

      // Validate the variant URL too
      if (!isUrlSafe(variantUrl)) {
        console.warn(`[Stream Proxy] Blocked unsafe variant URL: ${variantUrl}`)
        return NextResponse.json(
          { error: 'Invalid or blocked variant URL' },
          { status: 400 }
        )
      }

      console.log(`[Stream Proxy] Fetching variant playlist from: ${variantUrl}`)
      const variantResponse = await fetch(variantUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.pornhub.com/',
        },
      })

      if (!variantResponse.ok) {
        console.error(`[Stream Proxy] Failed to fetch variant playlist: ${variantResponse.status}`)
        return NextResponse.json(
          { error: `Failed to fetch variant playlist: ${variantResponse.status}` },
          { status: variantResponse.status }
        )
      }

      m3u8Content = await variantResponse.text()
      baseUrl = variantUrl
    }

    // Trim the original m3u8 BEFORE ad injection to remove embedded ads
    if (trimStartSeconds > 0) {
      m3u8Content = trimM3u8Start(m3u8Content, trimStartSeconds)
      console.log(`[Stream Proxy] Trimmed ${trimStartSeconds}s from start (removed embedded ads)`)
    }

    // Process the m3u8 with ad injection and URL rewriting
    let processed
    try {
      processed = await processM3u8({
        m3u8Content,
        baseUrl,
        segmentProxyMode,
        adsEnabled,
      })
    } catch (adError) {
      console.warn(`[Stream Proxy] Ad injection failed (likely DB error), processing without ads:`, adError instanceof Error ? adError.message : adError)
      // Process m3u8 to rewrite URLs, but disable ads
      processed = await processM3u8({
        m3u8Content,
        baseUrl,
        segmentProxyMode,
        adsEnabled: false,
      })
    }

    // Finalize content
    const finalContent = processed.content

    const formatInfo = processed.detectedFormat
      ? ` format: ${processed.detectedFormat.formatKey}${processed.transcodedAds ? ' (transcoded)' : ''}`
      : ''
    const cdnAdInfo = processed.cdnAdsStripped ? `, ${processed.cdnAdsStripped} CDN ads stripped` : ''
    console.log(`[Stream Proxy] Processed m3u8: ${processed.segmentCount} segments, ${processed.adsInjected} ads injected${cdnAdInfo}, duration: ${processed.duration}s,${formatInfo} (${Date.now() - requestStart}ms)`)

    // Cache the result
    setCachedM3u8(cacheKey, finalContent)

    return new Response(finalContent, {
      headers: {
        'Content-Type': rawParam ? 'text/plain; charset=utf-8' : 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })

  } catch (error) {
    console.error('[Stream Proxy] Error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to process stream' },
      { status: 500 }
    )
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
