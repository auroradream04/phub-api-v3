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
    // Fetch ads script
    fetch('https://hcdream.com/berlin/ads/scripts/heiliao.js')
      .then(res => res.text())
      .then(scriptText => {
        // Extract JSON from the script
        // The script should contain a JSON object
        try {
          const jsonMatch = scriptText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const adsData = JSON.parse(jsonMatch[0])
            setDefaultUrl(adsData.url || '')
            setAds(adsData.horizontalAds?.slice(0, 3) || [])
          }
        } catch (error) {
          console.error('Failed to parse ads script:', error)
        }
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
    <div className="space-y-4 my-6">
      {ads.map((ad, index) => (
        <button
          key={index}
          onClick={() => handleAdClick(ad)}
          className="w-full block border border-gray-200 rounded-lg overflow-hidden hover:border-blue-400 transition-colors"
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