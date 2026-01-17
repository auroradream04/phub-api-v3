import { prisma } from './prisma'

// Cache for site settings to avoid database hits on every request
const settingsCache = new Map<string, { value: string, timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

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

// Batch fetch multiple settings in a single query
export async function getSiteSettings(
  keys: string[],
  defaults: Record<string, string> = {}
): Promise<Record<string, string>> {
  const now = Date.now()
  const result: Record<string, string> = {}
  const keysToFetch: string[] = []

  // Check cache for each key
  for (const key of keys) {
    const cached = settingsCache.get(key)
    if (cached && now - cached.timestamp < CACHE_TTL) {
      result[key] = cached.value
    } else {
      keysToFetch.push(key)
    }
  }

  // Fetch missing keys in a single query
  if (keysToFetch.length > 0) {
    try {
      const settings = await prisma.siteSetting.findMany({
        where: { key: { in: keysToFetch } }
      })

      const settingsMap = new Map(settings.map(s => [s.key, s.value]))

      for (const key of keysToFetch) {
        const value = settingsMap.get(key) ?? defaults[key] ?? ''
        result[key] = value
        settingsCache.set(key, { value, timestamp: now })
      }
    } catch {
      // On error, use defaults
      for (const key of keysToFetch) {
        result[key] = defaults[key] ?? ''
      }
    }
  }

  return result
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
  // Proxy settings (for universal VOD proxy)
  PROXY_SEGMENT_MODE: 'proxy_segment_mode',       // 'cors' | 'full' | 'passthrough'
  PROXY_SEGMENT_URL: 'proxy_segment_url',         // Base URL for segment proxy
  PROXY_ADS_ENABLED: 'proxy_ads_enabled',         // Enable ads for proxied streams
  PROXY_CACHE_TTL: 'proxy_cache_ttl',             // Cache TTL in seconds
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

// Helper to get all ad settings at once (single DB query)
export async function getAdSettings(): Promise<AdSettings> {
  const keys = [
    SETTING_KEYS.AD_ALWAYS_PREROLL,
    SETTING_KEYS.AD_PREROLL_ENABLED,
    SETTING_KEYS.AD_POSTROLL_ENABLED,
    SETTING_KEYS.AD_MIDROLL_ENABLED,
    SETTING_KEYS.AD_MIDROLL_INTERVAL,
    SETTING_KEYS.AD_MAX_ADS_PER_VIDEO,
    SETTING_KEYS.AD_MIN_VIDEO_FOR_MIDROLL,
  ]

  const defaults: Record<string, string> = {
    [SETTING_KEYS.AD_ALWAYS_PREROLL]: 'true',
    [SETTING_KEYS.AD_PREROLL_ENABLED]: 'true',
    [SETTING_KEYS.AD_POSTROLL_ENABLED]: 'true',
    [SETTING_KEYS.AD_MIDROLL_ENABLED]: 'true',
    [SETTING_KEYS.AD_MIDROLL_INTERVAL]: '600',
    [SETTING_KEYS.AD_MAX_ADS_PER_VIDEO]: '20',
    [SETTING_KEYS.AD_MIN_VIDEO_FOR_MIDROLL]: '600',
  }

  const settings = await getSiteSettings(keys, defaults)

  return {
    alwaysPreroll: settings[SETTING_KEYS.AD_ALWAYS_PREROLL] === 'true',
    prerollEnabled: settings[SETTING_KEYS.AD_PREROLL_ENABLED] === 'true',
    postrollEnabled: settings[SETTING_KEYS.AD_POSTROLL_ENABLED] === 'true',
    midrollEnabled: settings[SETTING_KEYS.AD_MIDROLL_ENABLED] === 'true',
    midrollInterval: parseInt(settings[SETTING_KEYS.AD_MIDROLL_INTERVAL]),
    maxAdsPerVideo: parseInt(settings[SETTING_KEYS.AD_MAX_ADS_PER_VIDEO]),
    minVideoForMidroll: parseInt(settings[SETTING_KEYS.AD_MIN_VIDEO_FOR_MIDROLL]),
  }
}
