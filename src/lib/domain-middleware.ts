import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Extract domain from referer or origin header
 */
function extractDomain(request: NextRequest): string | null {
  try {
    const referer = request.headers.get('referer')
    const origin = request.headers.get('origin')
    const urlString = referer || origin

    if (!urlString) return null

    const url = new URL(urlString)
    let domain = url.hostname

    // Remove www. prefix
    if (domain.startsWith('www.')) {
      domain = domain.substring(4)
    }

    // Handle localhost for development
    if (domain === 'localhost' || domain.startsWith('192.168.') || domain.startsWith('127.0.')) {
      return 'localhost'
    }

    return domain
  } catch {
    return null
  }
}

/**
 * Get client IP from headers
 */
function getClientIP(request: NextRequest): string | null {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    null
  )
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
