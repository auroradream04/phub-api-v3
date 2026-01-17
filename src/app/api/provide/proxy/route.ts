import { NextRequest, NextResponse } from 'next/server'

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

// Fields that contain video playback URLs - ONLY these get rewritten
const VIDEO_URL_FIELDS = new Set([
  'vod_play_url',
  'vod_down_url',
])

/**
 * Rewrite URLs in a vod_play_url string value
 * Supports formats like:
 * - Simple URL: https://cdn.com/video.m3u8
 * - Prefixed URL: HD$https://cdn.com/hd.m3u8
 * - Multiple: HD$https://cdn.com/hd.m3u8#SD$https://cdn.com/sd.m3u8
 * - Episodes: Episode1$https://cdn.com/ep1.m3u8#Episode2$https://cdn.com/ep2.m3u8
 */
function rewritePlayUrl(value: string, proxyBase: string): string {
  // Pattern: Match any URL (http/https), optionally preceded by a prefix and $
  // This handles: "HD$https://...", "https://...", "player$https://..."
  const urlPattern = /([^$#\s]*\$)?(https?:\/\/[^#\s"'<>]+)/g

  return value.replace(urlPattern, (match, prefix, url) => {
    const encodedUrl = encodeURIComponent(url)
    const proxyUrl = `${proxyBase}?url=${encodedUrl}`
    return prefix ? `${prefix}${proxyUrl}` : proxyUrl
  })
}

/**
 * Recursively process JSON, but ONLY rewrite vod_play_url and vod_down_url fields
 * Everything else passes through unchanged
 */
function rewriteUrlsInJson(obj: unknown, proxyBase: string): unknown {
  if (obj === null || obj === undefined) {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => rewriteUrlsInJson(item, proxyBase))
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      // ONLY rewrite vod_play_url and vod_down_url
      if (VIDEO_URL_FIELDS.has(key) && typeof value === 'string') {
        result[key] = rewritePlayUrl(value, proxyBase)
      } else if (typeof value === 'object' && value !== null) {
        // Recurse into nested objects/arrays to find video items
        result[key] = rewriteUrlsInJson(value, proxyBase)
      } else {
        // Pass through everything else unchanged
        result[key] = value
      }
    }
    return result
  }

  // Primitives (string, number, boolean) pass through unchanged
  return obj
}

/**
 * Rewrite URLs in XML string - ONLY vod_play_url and vod_down_url
 */
function rewriteUrlsInXml(xml: string, proxyBase: string): string {
  // Rewrite URLs inside <dd> tags (MacCMS format for vod_play_url)
  // <dd flag="dplayer">HD$https://cdn.com/video.m3u8</dd>
  let result = xml.replace(
    /(<dd[^>]*>)(.*?)(<\/dd>)/gi,
    (match, openTag, content, closeTag) => {
      const rewritten = rewritePlayUrl(content, proxyBase)
      return `${openTag}${rewritten}${closeTag}`
    }
  )

  // Also rewrite vod_play_url and vod_down_url tags if they exist
  result = result.replace(
    /(<vod_play_url>)(.*?)(<\/vod_play_url>)/gi,
    (match, openTag, content, closeTag) => {
      const rewritten = rewritePlayUrl(content, proxyBase)
      return `${openTag}${rewritten}${closeTag}`
    }
  )

  result = result.replace(
    /(<vod_down_url>)(.*?)(<\/vod_down_url>)/gi,
    (match, openTag, content, closeTag) => {
      const rewritten = rewritePlayUrl(content, proxyBase)
      return `${openTag}${rewritten}${closeTag}`
    }
  )

  return result
}

// In-memory cache (5 minute TTL)
const CACHE_TTL = 5 * 60 * 1000
const MAX_CACHE_SIZE = 100

interface CachedResponse {
  content: string
  contentType: string
  cachedAt: number
}

const responseCache = new Map<string, CachedResponse>()

function getCached(cacheKey: string): CachedResponse | null {
  const cached = responseCache.get(cacheKey)
  if (!cached) return null

  if (Date.now() - cached.cachedAt > CACHE_TTL) {
    responseCache.delete(cacheKey)
    return null
  }

  return cached
}

function setCache(cacheKey: string, content: string, contentType: string): void {
  if (responseCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = responseCache.keys().next().value
    if (oldestKey) responseCache.delete(oldestKey)
  }

  responseCache.set(cacheKey, { content, contentType, cachedAt: Date.now() })
}

export async function GET(request: NextRequest) {
  const requestStart = Date.now()

  try {
    const url = request.nextUrl.searchParams.get('url')

    if (!url) {
      return NextResponse.json(
        { error: 'URL parameter is required. Usage: /api/provide/proxy?url=https://example.com/api.php/provide/vod' },
        { status: 400 }
      )
    }

    // Decode URL if encoded
    let decodedUrl: string
    try {
      decodedUrl = decodeURIComponent(url)
    } catch {
      decodedUrl = url
    }

    // SSRF protection
    if (!isUrlSafe(decodedUrl)) {
      console.warn(`[VOD Proxy] Blocked unsafe URL: ${decodedUrl}`)
      return NextResponse.json(
        { error: 'Invalid or blocked URL' },
        { status: 400 }
      )
    }

    // Preserve query parameters from original URL
    const originalUrl = new URL(decodedUrl)

    // Forward any additional query params from our request to the target
    const additionalParams = ['ac', 'pg', 't', 'wd', 'h', 'ids', 'at']
    for (const param of additionalParams) {
      const value = request.nextUrl.searchParams.get(param)
      if (value && !originalUrl.searchParams.has(param)) {
        originalUrl.searchParams.set(param, value)
      }
    }

    const finalUrl = originalUrl.toString()

    // Check cache
    const cacheKey = finalUrl
    const cached = getCached(cacheKey)
    if (cached) {
      console.log(`[VOD Proxy] Cache hit for ${finalUrl}`)
      return new Response(cached.content, {
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    console.log(`[VOD Proxy] Fetching: ${finalUrl}`)

    // Fetch the external API
    const response = await fetch(finalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, application/xml, text/xml, */*',
      },
    })

    if (!response.ok) {
      console.error(`[VOD Proxy] Failed to fetch: ${response.status} ${response.statusText}`)
      return NextResponse.json(
        { error: `Failed to fetch from source: ${response.status}` },
        { status: response.status }
      )
    }

    const contentType = response.headers.get('content-type') || 'application/json'
    const originalContent = await response.text()

    // Determine the base URL for our stream proxy
    const proxyBase = `${process.env.NEXTAUTH_URL || 'https://md8av.com'}/api/stream/proxy`

    let rewrittenContent: string
    let responseContentType: string

    // Detect format and rewrite URLs
    if (contentType.includes('xml') || originalContent.trim().startsWith('<?xml') || originalContent.trim().startsWith('<')) {
      // XML response
      rewrittenContent = rewriteUrlsInXml(originalContent, proxyBase)
      responseContentType = 'application/xml; charset=utf-8'
    } else {
      // Try JSON
      try {
        const jsonData = JSON.parse(originalContent)
        const rewrittenJson = rewriteUrlsInJson(jsonData, proxyBase)
        rewrittenContent = JSON.stringify(rewrittenJson)
        responseContentType = 'application/json; charset=utf-8'
      } catch {
        // Not valid JSON - pass through unchanged
        rewrittenContent = originalContent
        responseContentType = contentType
      }
    }

    console.log(`[VOD Proxy] Processed response (${rewrittenContent.length} bytes, ${responseContentType}, ${Date.now() - requestStart}ms)`)

    // Cache the result
    setCache(cacheKey, rewrittenContent, responseContentType)

    return new Response(rewrittenContent, {
      headers: {
        'Content-Type': responseContentType,
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })

  } catch (error) {
    console.error('[VOD Proxy] Error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to proxy VOD API' },
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
