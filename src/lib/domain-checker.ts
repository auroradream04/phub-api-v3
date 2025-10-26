import { prisma } from '@/lib/prisma'

/**
 * Extract domain from referer or origin header
 */
export function extractDomain(referer: string | null, origin: string | null): string | null {
  try {
    const urlString = referer || origin
    if (!urlString) return null

    const url = new URL(urlString)
    let domain = url.hostname

    // Remove www. prefix
    if (domain.startsWith('www.')) {
      domain = domain.substring(4)
    }

    return domain
  } catch {
    return null
  }
}

/**
 * Check if domain is allowed to access the API
 */
export async function checkDomainAccess(domain: string | null): Promise<{
  allowed: boolean
  domainAccessId?: string
  reason?: string
}> {
  if (!domain) {
    // No domain = allow (internal requests, direct API calls, etc.)
    return { allowed: true }
  }

  try {
    const domainRule = await prisma.domainAccess.findUnique({
      where: { domain }
    })

    if (!domainRule) {
      // No rule = allow by default
      return { allowed: true }
    }

    if (domainRule.status === 'blocked') {
      return {
        allowed: false,
        domainAccessId: domainRule.id,
        reason: domainRule.reason || 'Domain is blocked'
      }
    }

    return {
      allowed: true,
      domainAccessId: domainRule.id
    }
  } catch (error) {
    // On error, allow the request (fail open)
    return { allowed: true }
  }
}

/**
 * Log API request (async, non-blocking)
 */
export async function logApiRequest(data: {
  domain: string | null
  domainAccessId: string | null
  endpoint: string
  method: string
  statusCode: number
  responseTime: number
  ipAddress: string | null
  userAgent: string | null
  referer: string | null
  blocked: boolean
}) {
  try {
    await prisma.apiRequestLog.create({
      data: {
        domain: data.domain,
        domainAccessId: data.domainAccessId || undefined,
        endpoint: data.endpoint,
        method: data.method,
        statusCode: data.statusCode,
        responseTime: data.responseTime,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        referer: data.referer,
        blocked: data.blocked
      }
    })
  } catch (error) {
    // Silently fail - don't block requests if logging fails
  }
}
