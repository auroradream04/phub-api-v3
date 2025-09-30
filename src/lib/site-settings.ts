import { PrismaClient } from '@/generated/prisma'

const prisma = new PrismaClient()

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
  } catch (error) {
    console.error(`[SiteSettings] Error fetching setting "${key}":`, error)
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

    console.log(`[SiteSettings] Updated setting "${key}"`)
  } catch (error) {
    console.error(`[SiteSettings] Error setting "${key}":`, error)
    throw error
  }
}

export function clearSettingsCache(): void {
  settingsCache.clear()
  console.log('[SiteSettings] Cache cleared')
}

// Predefined setting keys
export const SETTING_KEYS = {
  CORS_PROXY_URL: 'cors_proxy_url',
  CORS_PROXY_ENABLED: 'cors_proxy_enabled',
  SEGMENTS_TO_SKIP: 'segments_to_skip',
} as const