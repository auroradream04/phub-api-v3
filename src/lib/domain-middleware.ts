import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * Extract domain with improved fallback precedence
 * Tries: referer → origin → x-forwarded-host → host → null
 */
function extractDomain(request: NextRequest): string | null {
  try {
    // Try referer first (most reliable for web requests)
    const referer = request.headers.get('referer')
    if (referer) {
      try {
        const url = new URL(referer)
        return normalizeDomain(url.hostname)
      } catch {
        // Invalid referer URL, continue to next option
      }
    }

    // Try origin header
    const origin = request.headers.get('origin')
    if (origin) {
      try {
        const url = new URL(origin)
        return normalizeDomain(url.hostname)
      } catch {
        // Invalid origin URL, continue to next option
      }
    }

    // Try x-forwarded-host (from proxies)
    const xForwardedHost = request.headers.get('x-forwarded-host')
    if (xForwardedHost) {
      return normalizeDomain(xForwardedHost.split(',')[0].trim())
    }

    // Try host header as last resort
    const host = request.headers.get('host')
    if (host) {
      return normalizeDomain(host.split(':')[0]) // Remove port if present
    }

    return null
  } catch {
    return null
  }
}

/**
 * Normalize domain: remove www, handle localhost
 */
function normalizeDomain(domain: string): string {
  // Remove www. prefix
  if (domain.startsWith('www.')) {
    domain = domain.substring(4)
  }

  // Handle localhost for development
  if (domain === 'localhost' || domain.startsWith('192.168.') || domain.startsWith('127.0.') || domain === '::1') {
    return 'localhost'
  }

  return domain
}

/**
 * Get client IP from headers with fallback
 * Checks: x-forwarded-for → x-real-ip → cf-connecting-ip (Cloudflare)
 */
function getClientIP(request: NextRequest): string | null {
  try {
    // x-forwarded-for can contain multiple IPs (client, proxy1, proxy2, ...)
    const xForwardedFor = request.headers.get('x-forwarded-for')
    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim()
    }

    // x-real-ip is set by nginx/similar
    const xRealIp = request.headers.get('x-real-ip')
    if (xRealIp) {
      return xRealIp.trim()
    }

    // Cloudflare IP
    const cfConnectingIp = request.headers.get('cf-connecting-ip')
    if (cfConnectingIp) {
      return cfConnectingIp.trim()
    }

    return null
  } catch {
    return null
  }
}

/**
 * Generate IP-based session hash for tracking direct/unknown requests
 * Hash of IP + User-Agent allows grouping requests from same client
 */
function generateIpSessionHash(ip: string | null, userAgent: string | null): string | null {
  if (!ip) return null

  try {
    const hashInput = `${ip}:${userAgent || 'unknown'}`
    return crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 16)
  } catch {
    return null
  }
}

/**
 * Generate client fingerprint from multiple headers
 * Used to correlate requests even if IP changes
 */
function generateClientFingerprint(request: NextRequest): string {
  try {
    const components = [
      request.headers.get('user-agent') || 'unknown',
      request.headers.get('accept-language') || 'unknown',
      request.headers.get('accept-encoding') || 'unknown'
    ]
    const fingerprint = components.join('|')
    return crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16)
  } catch {
    return 'unknown'
  }
}

/**
 * Check domain access and log request
 * Use this at the START of your route handlers
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   const domainCheck = await checkAndLogDomain(request, '/api/home', 'GET')
 *   if (!domainCheck.allowed) {
 *     return domainCheck.response // Returns 403 with error message
 *   }
 *
 *   // Continue with your route logic...
 * }
 */
export async function checkAndLogDomain(
  request: NextRequest,
  endpoint: string,
  method: string
): Promise<{
  allowed: boolean
  domain: string | null
  domainAccessId: string | null
  response?: NextResponse
  logRequest: (statusCode: number, responseTime: number) => Promise<void>
}> {
  const startTime = Date.now()
  const domain = extractDomain(request)
  const ipAddress = getClientIP(request)
  const userAgent = request.headers.get('user-agent')
  const referer = request.headers.get('referer')
  const hasReferrer = !!referer

  // Generate tracking hashes for requests without domain
  const ipSessionHash = domain ? null : generateIpSessionHash(ipAddress, userAgent)
  const clientFingerprint = generateClientFingerprint(request)

  let domainAccessId: string | null = null
  let allowed = true
  let blockReason: string | null = null

  // Check if domain is blocked (only if domain exists)
  if (domain && domain !== 'localhost') {
    try {
      const domainRule = await prisma.domainAccess.findUnique({
        where: { domain }
      })

      if (domainRule) {
        domainAccessId = domainRule.id

        if (domainRule.status === 'blocked') {
          allowed = false
          blockReason = domainRule.reason || 'Domain is blocked'
        }
      }
    } catch (error) {
      console.error('[DomainCheck] Error checking domain:', error)
      // Fail open - allow request on database error
    }
  }

  // Function to log the request after response
  const logRequest = async (statusCode: number, responseTime: number) => {
    try {
      await prisma.apiRequestLog.create({
        data: {
          domain,
          domainAccessId,
          endpoint,
          method,
          statusCode,
          responseTime,
          ipAddress,
          userAgent,
          referer,
          hasReferrer,
          ipSessionHash,
          clientFingerprint,
          blocked: !allowed
        }
      })
    } catch (error) {
      console.error('[DomainCheck] Error logging request:', error)
    }
  }

  // If blocked, return 403 response and log it
  if (!allowed) {
    const responseTime = Date.now() - startTime
    await logRequest(403, responseTime)

    return {
      allowed: false,
      domain,
      domainAccessId,
      response: NextResponse.json(
        {
          error: 'Access Denied',
          message: blockReason || 'Your domain has been blocked from accessing this API',
          domain,
          blocked: true
        },
        { status: 403 }
      ),
      logRequest
    }
  }

  // If allowed, return logging function for later use
  return {
    allowed: true,
    domain,
    domainAccessId,
    logRequest
  }
}

/**
 * Simplified version - just checks access without logging
 * Use this if you only want to block domains without tracking requests
 */
export async function checkDomainAccess(request: NextRequest): Promise<{
  allowed: boolean
  response?: NextResponse
}> {
  const domain = extractDomain(request)

  if (!domain || domain === 'localhost') {
    return { allowed: true }
  }

  try {
    const domainRule = await prisma.domainAccess.findUnique({
      where: { domain }
    })

    if (domainRule && domainRule.status === 'blocked') {
      return {
        allowed: false,
        response: NextResponse.json(
          {
            error: 'Access Denied',
            message: domainRule.reason || 'Your domain has been blocked from accessing this API',
            domain,
            blocked: true
          },
          { status: 403 }
        )
      }
    }
  } catch (error) {
    console.error('[DomainCheck] Error:', error)
  }

  return { allowed: true }
}
