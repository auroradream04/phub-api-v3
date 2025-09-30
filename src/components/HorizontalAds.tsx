'use client'

import { useEffect, useState } from 'react'

interface HorizontalAd {
  title: string
  image: string
  urlArray?: string[]
}

export default function HorizontalAds() {
  const [ads, setAds] = useState<HorizontalAd[]>([])
  const [defaultUrl, setDefaultUrl] = useState<string>('')

  useEffect(() => {
    // Fetch ads from our API endpoint (proxied)
    fetch('/api/ads/script')
      .then(res => res.json())
      .then(adsData => {
        setDefaultUrl(adsData.url || '')
        setAds(adsData.horizontalAds?.slice(0, 3) || [])
      })
      .catch(error => {
        console.error('Failed to fetch ads:', error)
      })
  }, [])

  const handleAdClick = (ad: HorizontalAd) => {
    // If ad has urlArray, pick a random one, otherwise use default
    if (ad.urlArray && ad.urlArray.length > 0) {
      const randomUrl = ad.urlArray[Math.floor(Math.random() * ad.urlArray.length)]
      window.open(`https://${randomUrl}`, '_blank', 'noopener,noreferrer')
    } else if (defaultUrl) {
      window.open(defaultUrl, '_blank', 'noopener,noreferrer')
    }
  }

  if (ads.length === 0) return null

  return (
    <div className="flex flex-col items-center gap-1">
      {ads.map((ad, index) => (
        <button
          key={index}
          onClick={() => handleAdClick(ad)}
          className="w-3/5 block border border-gray-200 rounded-lg overflow-hidden hover:border-blue-400 transition-colors"
        >
          <img
            src={ad.image}
            alt={ad.title}
            className="w-full h-auto"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  )
}