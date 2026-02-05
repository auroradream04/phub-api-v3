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
    // Don't encode - pass URL as-is since we do raw URL extraction
    const proxyUrl = `${proxyBase}?url=${url}`
    return prefix ? `${prefix}${proxyUrl}` : proxyUrl
  })
}

/**
 * Rewrite URL fields in JSON response
 * Copies all fields as-is but rewrites vod_play_url and vod_down_url
 */
function rewriteUrlsInJson(jsonData: Record<string, unknown>, proxyBase: string): Record<string, unknown> {
  // Copy everything from the original response
  const result = { ...jsonData }

  // If there's a list, map through it and rewrite URL fields
  if (Array.isArray(result.list)) {
    result.list = result.list.map(item => {
      if (typeof item === 'object' && item !== null) {
        const videoItem = item as Record<string, unknown>
        const newItem = { ...videoItem }

        if (videoItem.vod_play_url && typeof videoItem.vod_play_url === 'string') {
          newItem.vod_play_url = rewritePlayUrl(videoItem.vod_play_url, proxyBase)
        }

        if (videoItem.vod_down_url && typeof videoItem.vod_down_url === 'string') {
          newItem.vod_down_url = rewritePlayUrl(videoItem.vod_down_url, proxyBase)
        }

        return newItem
      }
      return item
    })
  }

  return result
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
    // Handle both encoded and unencoded URLs
    // MacCMS often sends: /api/provide/proxy?url=https://example.com/api?ac=list&pg=1
    // where &pg=1 should be part of the target URL, not our params

    let targetUrl: string | null = null

    // First, try to extract from raw URL (handles unencoded case)
    const rawUrl = request.url
    const urlParamIndex = rawUrl.indexOf('?url=')

    if (urlParamIndex !== -1) {
      // Everything after ?url= is the target URL
      targetUrl = rawUrl.substring(urlParamIndex + 5)

      // Decode if it was URL-encoded
      try {
        // Check if it looks encoded (contains %3A for :)
        if (targetUrl.includes('%3A') || targetUrl.includes('%2F')) {
          targetUrl = decodeURIComponent(targetUrl)
        }
      } catch {
        // Keep as-is if decoding fails
      }

      // Fix malformed URLs where first query param uses & instead of ?
      // e.g., "https://api.com/vod/&ac=list" -> "https://api.com/vod/?ac=list"
      targetUrl = targetUrl.replace(/^([^?]*?)&/, '$1?')
    }

    // Fallback to standard param extraction
    if (!targetUrl) {
      targetUrl = request.nextUrl.searchParams.get('url')
    }

    if (!targetUrl) {
      return NextResponse.json(
        { error: 'URL parameter is required. Usage: /api/provide/proxy?url=https://example.com/api.php/provide/vod' },
        { status: 400 }
      )
    }

    // SSRF protection
    if (!isUrlSafe(targetUrl)) {
      console.warn(`[VOD Proxy] Blocked unsafe URL: ${targetUrl}`)
      return NextResponse.json(
        { error: 'Invalid or blocked URL' },
        { status: 400 }
      )
    }

    const finalUrl = targetUrl

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
