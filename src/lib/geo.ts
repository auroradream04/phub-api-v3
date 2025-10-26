/**
 * Extract real IP address from Next.js request headers
 * Checks common proxy headers first, falls back to direct connection
 */
export function getClientIP(headers: Headers): string | null {
  // Check common proxy headers
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first (original client)
    return forwardedFor.split(',')[0].trim()
  }

  const realIP = headers.get('x-real-ip')
  if (realIP) return realIP

  const cfConnectingIP = headers.get('cf-connecting-ip') // Cloudflare
  if (cfConnectingIP) return cfConnectingIP

  // If no proxy headers, we can't determine the IP from Next.js API route
  // In production with a reverse proxy, one of the above headers should be present
  return null
}

/**
 * Get country code from IP address using free API
 * Returns ISO 3166-1 alpha-2 country code (e.g., 'US', 'CN', 'GB')
 * Uses ip-api.com (free, 45 requests/minute limit)
 */
export async function getCountryFromIP(ip: string | null): Promise<string | null> {
  if (!ip) return null
  if (ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return null // Skip local/private IPs
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
      signal: AbortSignal.timeout(2000), // 2 second timeout
    })

    if (!response.ok) return null

    const data = await response.json()
    return data.countryCode || null
  } catch (error) {
    return null
  }
}

/**
 * Get full country name from country code
 */
export function getCountryName(countryCode: string | null): string | null {
  if (!countryCode) return null

  const countries: Record<string, string> = {
    US: 'United States',
    CN: 'China',
    IN: 'India',
    GB: 'United Kingdom',
    CA: 'Canada',
    AU: 'Australia',
    DE: 'Germany',
    FR: 'France',
    JP: 'Japan',
    BR: 'Brazil',
    RU: 'Russia',
    KR: 'South Korea',
    ES: 'Spain',
    IT: 'Italy',
    MX: 'Mexico',
    ID: 'Indonesia',
    NL: 'Netherlands',
    SA: 'Saudi Arabia',
    TR: 'Turkey',
    CH: 'Switzerland',
    PL: 'Poland',
    BE: 'Belgium',
    SE: 'Sweden',
    NG: 'Nigeria',
    AR: 'Argentina',
    NO: 'Norway',
    AT: 'Austria',
    IL: 'Israel',
    IE: 'Ireland',
    DK: 'Denmark',
    SG: 'Singapore',
    MY: 'Malaysia',
    HK: 'Hong Kong',
    PH: 'Philippines',
    FI: 'Finland',
    CL: 'Chile',
    PK: 'Pakistan',
    VN: 'Vietnam',
    TH: 'Thailand',
    EG: 'Egypt',
    // Add more as needed
  }

  return countries[countryCode] || countryCode
}
