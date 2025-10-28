'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface HorizontalAd {
  title: string
  image: string
  urlArray?: string[]
}

export default function HorizontalAdsSlider() {
  const [ads, setAds] = useState<HorizontalAd[]>([])
  const [defaultUrl, setDefaultUrl] = useState<string>('')
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    // Fetch ads from our API endpoint (proxied)
    fetch('/api/ads/script')
      .then(res => res.json())
      .then(adsData => {
        setDefaultUrl(adsData.url || '')
        setAds(adsData.horizontalAds || [])
      })
      .catch(error => {

      })
  }, [])

  useEffect(() => {
    if (ads.length === 0) return

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % ads.length)
    }, 3000) // Change ad every 3 seconds

    return () => clearInterval(interval)
  }, [ads.length])

  const handleAdClick = () => {
    const currentAd = ads[currentIndex]
    // If ad has urlArray, pick a random one, otherwise use default
    if (currentAd.urlArray && currentAd.urlArray.length > 0) {
      const randomUrl = currentAd.urlArray[Math.floor(Math.random() * currentAd.urlArray.length)]
      window.open(`https://${randomUrl}`, '_blank', 'noopener,noreferrer')
    } else if (defaultUrl) {
      window.open(defaultUrl, '_blank', 'noopener,noreferrer')
    }
  }

  if (ads.length === 0) return null

  return (
    <div className="relative w-full overflow-hidden">
      <div
        className="flex transition-transform duration-500 ease-in-out"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {ads.map((ad, index) => (
          <button
            key={index}
            onClick={handleAdClick}
            className="w-full flex-shrink-0 rounded-lg overflow-hidden hover:opacity-90 transition-opacity cursor-pointer"
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

      {/* Dots indicator */}
      <div className="flex justify-center gap-2 mt-3">
        {ads.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`w-2 h-2 rounded-full transition-colors ${
              index === currentIndex ? 'bg-blue-300' : 'bg-gray-300'
            }`}
            aria-label={`Go to ad ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}