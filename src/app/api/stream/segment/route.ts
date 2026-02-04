import { NextRequest, NextResponse } from 'next/server'
import https from 'node:https'
import type { IncomingMessage } from 'node:http'
import { getRandomProxy, getAgentByIndex } from '@/lib/proxy'

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

// CDN domains that require proxy for IP token validation
const CDN_DOMAINS = ['phncdn.com', 'phprcdn.com']

function isCdnDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return CDN_DOMAINS.some(d => hostname.endsWith(d))
  } catch {
    return false
  }
}

function fetchViaProxy(
  url: string,
  proxyAgent: unknown,
  headers: Record<string, string>
): Promise<{
  status: number
  headers: Record<string, string>
  body: ReadableStream<Uint8Array>
}> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: { ...headers, Host: parsedUrl.hostname },
        agent: proxyAgent as import('https').Agent,
      },
      (res: IncomingMessage) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            res.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
            res.on('end', () => controller.close())
            res.on('error', (err) => controller.error(err))
          },
          cancel() { res.destroy() },
        })
        const resHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) {
          if (v) resHeaders[k] = Array.isArray(v) ? v[0] : v
        }
        resolve({ status: res.statusCode || 500, headers: resHeaders, body })
      }
    )
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Proxy fetch timeout')) })
    req.end()
  })
}

export async function GET(request: NextRequest) {
  try {
    // Use standard URL parser instead of request.nextUrl to avoid
    // Next.js URL normalization that can mangle percent-encoded values
    const parsedUrl = new URL(request.url)
    const decodedUrl = parsedUrl.searchParams.get('url')
    const pxParam = parsedUrl.searchParams.get('px')

    if (!decodedUrl) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      )
    }

    console.log(`[Segment Proxy] URL param decoded to: ${decodedUrl.substring(0, 150)}`)

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
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }

    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader
    }

    // Fetch the segment - use proxy for CDN domains (they validate IP in tokens)
    let response: Response

    if (isCdnDomain(decodedUrl)) {
      // Use proxy index (deterministic across serverless instances) to get the
      // same proxy that generated CDN tokens. Fall back to random proxy.
      const proxyIdx = pxParam ? parseInt(pxParam, 10) : -1
      let proxyAgent = proxyIdx >= 0 ? getAgentByIndex(proxyIdx) : null
      let proxyLabel = proxyIdx >= 0 ? `index:${proxyIdx}` : ''

      if (!proxyAgent) {
        const randomProxy = getRandomProxy('segment')
        if (!randomProxy) {
          console.error('[Segment Proxy] No proxy available for CDN fetch')
          return NextResponse.json({ error: 'No proxy available' }, { status: 503 })
        }
        proxyAgent = randomProxy.agent
        proxyLabel = `random:${randomProxy.proxyUrl}`
      }

      console.log(`[Segment Proxy] Fetching via proxy (${proxyLabel}): ${decodedUrl.substring(0, 120)}...`)
      const result = await fetchViaProxy(decodedUrl, proxyAgent, fetchHeaders)
      const hdrs = new Headers()
      for (const [k, v] of Object.entries(result.headers)) hdrs.set(k, v)
      response = new Response(result.body, { status: result.status, headers: hdrs })
    } else {
      console.log(`[Segment Proxy] Fetching directly: ${decodedUrl.substring(0, 120)}...`)
      response = await fetch(decodedUrl, { headers: fetchHeaders, redirect: 'follow' })
    }

    if (!response.ok && response.status !== 206) {
      const errorBody = await response.text().catch(() => '')
      const respHeaders = Object.fromEntries(response.headers.entries())
      console.error(`[Segment Proxy] Failed: ${response.status} | URL: ${decodedUrl.substring(0, 120)} | proxy: ${pxParam || 'none'}`)
      return NextResponse.json(
        {
          error: `Failed to fetch segment: ${response.status}`,
          debug: {
            status: response.status,
            fetchedUrl: decodedUrl,
            cdnHeaders: respHeaders,
            cdnBody: errorBody.substring(0, 200),
            proxyIndex: pxParam || 'none',
          }
        },
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
    const parsedUrl = new URL(request.url)
    const decodedUrl = parsedUrl.searchParams.get('url')

    if (!decodedUrl) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      )
    }

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
