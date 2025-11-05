import { prisma } from './prisma'

// Cache for site settings to avoid database hits on every request
const settingsCache = new Map<string, { value: string, timestamp: number }>()
const CACHE_TTL = 60000 // 1 minute

export async function getSiteSetting(key: string, defaultValue: string = ''): Promise<string> {
  // Check cache first
  const cached = settingsCache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value
  }

  try {
    const setting = await prisma.siteSetting.findUnique({
      where: { key }
    })

    const value = setting?.value || defaultValue

    // Update cache
    settingsCache.set(key, { value, timestamp: Date.now() })

    return value
  } catch {
    return defaultValue
  }
}

export async function setSiteSetting(key: string, value: string): Promise<void> {
  try {
    await prisma.siteSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    })

    // Update cache
    settingsCache.set(key, { value, timestamp: Date.now() })
  } catch {
    throw error
  }
}

export function clearSettingsCache(): void {
  settingsCache.clear()
}

// Predefined setting keys
export const SETTING_KEYS = {
  CORS_PROXY_URL: 'cors_proxy_url',
  CORS_PROXY_ENABLED: 'cors_proxy_enabled',
  SEGMENTS_TO_SKIP: 'segments_to_skip',
  ADS_SCRIPT_URL: 'ads_script_url',
} as const
