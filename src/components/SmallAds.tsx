'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface SmallAd {
  title: string
  image: string
  urlArray?: string[]
  count: string
}

interface SmallAdsData {
  desktopAds?: SmallAd[][]
  mobileAds?: SmallAd[][]
}

export default function SmallAds() {
  const [adsData, setAdsData] = useState<SmallAdsData>({})
  const [isMobile, setIsMobile] = useState(false)
  const [defaultUrl, setDefaultUrl] = useState<string>('')

  useEffect(() => {
    // Check if mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    // Fetch ads from our API endpoint (proxied)
    fetch('/api/ads/script')
      .then(res => res.json())
      .then(adsResponse => {
        setDefaultUrl(adsResponse.url || '')
        if (adsResponse.smallAds) {
          setAdsData(adsResponse.smallAds)
        }
      })
      .catch(error => {
        console.error('Failed to fetch small ads:', error)
      })
  }, [])

  const handleAdClick = (ad: SmallAd) => {
    // If ad has urlArray, pick a random one, otherwise use default
    if (ad.urlArray && ad.urlArray.length > 0) {
      let url = ad.urlArray[Math.floor(Math.random() * ad.urlArray.length)]
      // Ensure URL has protocol
      if (!url.startsWith('http')) {
        url = `https://${url}`
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    } else if (defaultUrl) {
      window.open(defaultUrl, '_blank', 'noopener,noreferrer')
    }
  }

  // Determine which ads to show based on screen size
  const adsToShow =
    isMobile && adsData.mobileAds
      ? adsData.mobileAds[0] || []
      : adsData.desktopAds
        ? adsData.desktopAds[0] || []
        : []

  if (!adsToShow || adsToShow.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 justify-center items-center">
      {adsToShow.map((ad, index) => (
        <button
          key={index}
          onClick={() => handleAdClick(ad)}
          title={ad.title}
          className="block border border-gray-200 rounded-lg overflow-hidden hover:border-blue-400 transition-colors relative hover:shadow-md"
        >
          <Image
            src={ad.image}
            alt={ad.title}
            width={100}
            height={100}
            className="w-auto h-auto max-w-[100px] max-h-[100px]"
            loading="lazy"
          />
        </button>
      ))}
    </div>
  )
}
