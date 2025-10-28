import HorizontalAdsClient from './HorizontalAds.client'

interface HorizontalAd {
  title: string
  image: string
  urlArray?: string[]
}

async function fetchAds() {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/ads/script`, { cache: 'no-store' })
    const adsData = await response.json()

    return {
      defaultUrl: adsData.url || '',
      ads: adsData.horizontalAds?.slice(0, 3) || []
    }
  } catch (error) {
    console.error('[HorizontalAds] Failed to fetch ads:', error)
    return {
      defaultUrl: '',
      ads: []
    }
  }
}

export default async function HorizontalAds() {
  const { defaultUrl, ads } = await fetchAds()

  if (ads.length === 0) return null

  return <HorizontalAdsClient ads={ads} defaultUrl={defaultUrl} />
}
