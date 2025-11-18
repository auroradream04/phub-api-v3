import { prisma } from './prisma'
import { AdSettings } from './site-settings'

export interface AdPlacement {
  adIndex: number
  timeSeconds: number
  percentageOfVideo: number
  type: 'pre-roll' | 'mid-roll' | 'post-roll'
  selectedAd?: {
    id: string
    segments: unknown[]
  }
  injected?: boolean
}

/**
 * Calculate ad placements based on video duration and settings
 */
export function calculateAdPlacements(
  videoDurationSeconds: number,
  settings: AdSettings
): AdPlacement[] {
  const placements: AdPlacement[] = []

  // 1. ALWAYS ADD PRE-ROLL (mandatory if enabled)
  if (settings.alwaysPreroll && settings.prerollEnabled) {
    placements.push({
      adIndex: 0,
      timeSeconds: 0,
      percentageOfVideo: 0,
      type: 'pre-roll'
    })
  }

  // 2. ADD MID-ROLLS (every N minutes)
  if (
    settings.midrollEnabled &&
    videoDurationSeconds >= settings.minVideoForMidroll
  ) {
    let currentTime = settings.midrollInterval // Start at configured interval
    let adIndex = placements.length

    while (
      currentTime < videoDurationSeconds &&
      adIndex < settings.maxAdsPerVideo
    ) {
      const percentagePosition =
        (currentTime / videoDurationSeconds) * 100

      placements.push({
        adIndex: adIndex,
        timeSeconds: currentTime,
        percentageOfVideo: percentagePosition,
        type: 'mid-roll'
      })

      currentTime += settings.midrollInterval
      adIndex++
    }
  }

  // 3. ADD POST-ROLL AT END
  if (settings.postrollEnabled && videoDurationSeconds > 0) {
    placements.push({
      adIndex: placements.length,
      timeSeconds: videoDurationSeconds,
      percentageOfVideo: 100,
      type: 'post-roll'
    })
  }

  return placements
}

/**
 * Calculate video duration from M3U8 playlist
 * Assumes standard HLS format with #EXTINF tags containing duration
 */
export function calculateM3u8Duration(m3u8Text: string): number {
  const lines = m3u8Text.split('\n')
  let totalDuration = 0

  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      // Extract duration from #EXTINF:10.0, format
      const match = line.match(/#EXTINF:([\d.]+),/)
      if (match && match[1]) {
        totalDuration += parseFloat(match[1])
      }
    }
  }

  return Math.round(totalDuration)
}

/**
 * Select ad by weighted random selection
 */
export function selectAdByWeight(
  ads: Array<{ id: string; weight: number; segments: unknown[] }>
): typeof ads[0] | null {
  if (ads.length === 0) return null

  const totalWeight = ads.reduce((sum, ad) => sum + ad.weight, 0)
  let random = Math.random() * totalWeight

  for (const ad of ads) {
    random -= ad.weight
    if (random <= 0) {
      return ad
    }
  }

  return ads[0]
}

/**
 * Fetch active ads from database
 */
export async function getActiveAds() {
  return await prisma.ad.findMany({
    where: { status: 'active' },
    include: {
      segments: true
    }
  })
}

/**
 * Assign ads to placements
 * Returns placements with assigned ads
 */
export async function assignAdsToplacements(
  placements: AdPlacement[]
): Promise<AdPlacement[]> {
  const activeAds = await getActiveAds()

  if (activeAds.length === 0) {
    return placements.map(p => ({ ...p, selectedAd: undefined }))
  }

  // Check for forced ad
  const forcedAd = activeAds.find(ad => ad.forceDisplay)

  return placements.map(placement => {
    let selectedAd = null

    if (forcedAd) {
      selectedAd = forcedAd
    } else {
      selectedAd = selectAdByWeight(activeAds)
    }

    return {
      ...placement,
      selectedAd: selectedAd
        ? {
            id: selectedAd.id,
            segments: selectedAd.segments
          }
        : undefined
    }
  })
}
