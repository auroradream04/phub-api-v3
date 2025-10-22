/**
 * Extract domain from a referrer string (URL or 'direct')
 * Used consistently across ads, API logs, and other domain tracking
 */
export function extractDomainFromReferrer(referrer: string | null | undefined): string | null {
  if (!referrer || referrer === 'direct') {
    return null
  }

  try {
    const url = new URL(referrer)
    let domain = url.hostname

    // Remove www. prefix for consistency
    if (domain.startsWith('www.')) {
      domain = domain.substring(4)
    }

    return domain
  } catch {
    // If it's not a valid URL and not 'direct', return null
    return null
  }
}

/**
 * Get display name for domain (for UI)
 * Returns either the domain or "Direct/Unknown" as fallback
 */
export function getDomainDisplayName(referrer: string | null | undefined): string {
  const domain = extractDomainFromReferrer(referrer)
  return domain || 'Direct/Unknown'
}
