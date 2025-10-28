'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

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
          className="w-full md:w-3/5 block rounded-lg overflow-hidden hover:opacity-90 transition-opacity relative"
        >
          <Image
            src={ad.image}
            alt={ad.title}
            width={800}
            height={200}
            className="w-full h-auto"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  )
}