import { NextRequest, NextResponse } from 'next/server'
import { checkDomainAccess, extractDomain, logApiRequest } from '@/lib/domain-checker'

// Internal API for domain checking (called from middleware or routes)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { referer, origin, endpoint, method } = body

    const domain = extractDomain(referer, origin)
    const accessCheck = await checkDomainAccess(domain)

    return NextResponse.json({
      domain,
      allowed: accessCheck.allowed,
      domainAccessId: accessCheck.domainAccessId,
      reason: accessCheck.reason
    })
  } catch (error) {
    console.error('[Internal] Error checking domain:', error)
    // Fail open - allow request on error
    return NextResponse.json({ allowed: true })
  }
}
