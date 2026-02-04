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

export async function GET(request: NextRequest) {
  try {
    // Extract url param from raw URL to avoid Next.js URL normalization issues
    // request.nextUrl.searchParams can double-decode percent-encoded values
    const rawUrl = request.url
    const urlParamMatch = rawUrl.match(/[?&]url=([^&]+)/)
    const rawUrlParam = urlParamMatch ? urlParamMatch[1] : null

    if (!rawUrlParam) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      )
    }

    // Single decode of the URL parameter
    const decodedUrl = decodeURIComponent(rawUrlParam)

    // SSRF protection
    if (!isUrlSafe(decodedUrl)) {
      console.warn(`[Segment Proxy] Blocked unsafe URL: ${decodedUrl}`)
      return NextResponse.json(
        { error: 'Invalid or blocked URL' },
        { status: 400 }
      )
    }

    // Get Range header for partial content support
    const rangeHeader = request.headers.get('range')

    // Prepare fetch headers
    const fetchHeaders: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }

    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader
    }

    // Fetch the segment
    console.log(`[Segment Proxy] Fetching: ${decodedUrl.substring(0, 120)}...`)
    const response = await fetch(decodedUrl, {
      headers: fetchHeaders,
      redirect: 'follow',
    })

    if (!response.ok && response.status !== 206) {
      const errorBody = await response.text().catch(() => '')
      console.error(`[Segment Proxy] Failed: ${response.status} ${response.statusText} | URL: ${decodedUrl} | Body: ${errorBody.substring(0, 200)}`)
      return NextResponse.json(
        { error: `Failed to fetch segment: ${response.status}` },
        { status: response.status }
      )
    }

    // Get content type - default to video/mp2t for ts files
    const contentType = response.headers.get('content-type') || 'video/mp2t'
    const contentLength = response.headers.get('content-length')
    const contentRange = response.headers.get('content-range')

    // Build response headers
    const responseHeaders: HeadersInit = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
    }

    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength
    }

    if (contentRange) {
      responseHeaders['Content-Range'] = contentRange
    }

    // Stream the response
    return new Response(response.body, {
      status: response.status, // 200 or 206
      headers: responseHeaders,
    })

  } catch (error) {
    console.error('[Segment Proxy] Error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to fetch segment' },
      { status: 500 }
    )
  }
}

// Support HEAD requests for content info
export async function HEAD(request: NextRequest) {
  try {
    const rawUrl = request.url
    const urlParamMatch = rawUrl.match(/[?&]url=([^&]+)/)
    const rawUrlParam = urlParamMatch ? urlParamMatch[1] : null

    if (!rawUrlParam) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      )
    }

    const decodedUrl = decodeURIComponent(rawUrlParam)

    if (!isUrlSafe(decodedUrl)) {
      return NextResponse.json(
        { error: 'Invalid or blocked URL' },
        { status: 400 }
      )
    }

    const response = await fetch(decodedUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    const contentType = response.headers.get('content-type') || 'video/mp2t'
    const contentLength = response.headers.get('content-length')

    const headers: HeadersInit = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
    }

    if (contentLength) {
      headers['Content-Length'] = contentLength
    }

    return new Response(null, {
      status: response.status,
      headers,
    })

  } catch (error) {
    console.error('[Segment Proxy] HEAD Error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to fetch segment info' },
      { status: 500 }
    )
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
    },
  })
}
