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
  } catch (error) {
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
  // Ad placement settings
  AD_ALWAYS_PREROLL: 'AD_ALWAYS_PREROLL',
  AD_PREROLL_ENABLED: 'AD_PREROLL_ENABLED',
  AD_POSTROLL_ENABLED: 'AD_POSTROLL_ENABLED',
  AD_MIDROLL_ENABLED: 'AD_MIDROLL_ENABLED',
  AD_MIDROLL_INTERVAL: 'AD_MIDROLL_INTERVAL',
  AD_MAX_ADS_PER_VIDEO: 'AD_MAX_ADS_PER_VIDEO',
  AD_MIN_VIDEO_FOR_MIDROLL: 'AD_MIN_VIDEO_FOR_MIDROLL',
} as const

// Ad settings interface
export interface AdSettings {
  alwaysPreroll: boolean
  prerollEnabled: boolean
  postrollEnabled: boolean
  midrollEnabled: boolean
  midrollInterval: number
  maxAdsPerVideo: number
  minVideoForMidroll: number
}

// Helper to get all ad settings at once
export async function getAdSettings(): Promise<AdSettings> {
  return {
    alwaysPreroll: (await getSiteSetting(SETTING_KEYS.AD_ALWAYS_PREROLL, 'true')) === 'true',
    prerollEnabled: (await getSiteSetting(SETTING_KEYS.AD_PREROLL_ENABLED, 'true')) === 'true',
    postrollEnabled: (await getSiteSetting(SETTING_KEYS.AD_POSTROLL_ENABLED, 'true')) === 'true',
    midrollEnabled: (await getSiteSetting(SETTING_KEYS.AD_MIDROLL_ENABLED, 'true')) === 'true',
    midrollInterval: parseInt(await getSiteSetting(SETTING_KEYS.AD_MIDROLL_INTERVAL, '600')),
    maxAdsPerVideo: parseInt(await getSiteSetting(SETTING_KEYS.AD_MAX_ADS_PER_VIDEO, '20')),
    minVideoForMidroll: parseInt(await getSiteSetting(SETTING_KEYS.AD_MIN_VIDEO_FOR_MIDROLL, '600')),
  }
}
