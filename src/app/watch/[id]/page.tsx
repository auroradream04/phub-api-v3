'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, Star, Clock, ChevronLeft } from 'lucide-react'
import Hls from 'hls.js'
import HorizontalAdsSlider from '@/components/HorizontalAdsSlider'

interface MediaDefinition {
  quality: number
  videoUrl: string
  format: string
}

interface VideoInfo {
  title: string
  views: number
  rating: number
  duration: string
  preview: string
  mediaDefinitions: MediaDefinition[]
  tags?: string[]
  pornstars?: string[]
}

export default function WatchPage() {
  const params = useParams()
  const videoId = params.id as string

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedQuality, setSelectedQuality] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    // Fetch video info
    fetch(`/api/watch/${videoId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch video')
        return res.json()
      })
      .then(data => {
        setVideoInfo(data)

        // Select highest quality by default
        if (data.mediaDefinitions && data.mediaDefinitions.length > 0) {
          const qualities = data.mediaDefinitions
            .filter((md: MediaDefinition) => md.format === 'hls')
            .sort((a: MediaDefinition, b: MediaDefinition) => b.quality - a.quality)

          if (qualities.length > 0) {
            setSelectedQuality(qualities[0].quality)
          }
        }

        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch video:', err)
        setError('无法加载视频信息')
        setLoading(false)
      })
  }, [videoId])

  useEffect(() => {
    if (!videoInfo || selectedQuality === null || !videoRef.current) return

    const selectedMedia = videoInfo.mediaDefinitions.find(
      md => md.quality === selectedQuality && md.format === 'hls'
    )

    if (!selectedMedia) return

    const video = videoRef.current
    const videoSrc = selectedMedia.videoUrl

    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      })

      hls.loadSource(videoSrc)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.error('Playback failed:', e))
      })

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data)
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('Network error')
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('Media error')
              hls.recoverMediaError()
              break
            default:
              console.error('Fatal error')
              break
          }
        }
      })

      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = videoSrc
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.error('Playback failed:', e))
      })
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
    }
  }, [videoInfo, selectedQuality])

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="text-2xl font-bold text-blue-600">
                视频中心
              </Link>
            </div>
          </div>
        </header>

        <div className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-6">
            <div className="w-full aspect-video bg-gray-200 rounded-lg"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !videoInfo) {
    return (
      <div className="min-h-screen bg-white">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="text-2xl font-bold text-blue-600">
                视频中心
              </Link>
            </div>
          </div>
        </header>

        <div className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-red-600 text-lg mb-4">{error || '视频未找到'}</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
            >
              <ChevronLeft className="w-5 h-5" />
              返回首页
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const hlsQualities = videoInfo.mediaDefinitions
    .filter(md => md.format === 'hls')
    .sort((a, b) => b.quality - a.quality)

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-2xl font-bold text-blue-600">
              视频中心
            </Link>
            <Link
              href="/"
              className="text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" />
              返回首页
            </Link>
          </div>
        </div>
      </header>

      {/* Video Player Section */}
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/* Video Player */}
          <div className="w-full aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              className="w-full h-full"
              controls
              playsInline
              poster={videoInfo.preview}
            />
          </div>

          {/* Horizontal Ads Slider */}
          <HorizontalAdsSlider />

          {/* Video Info */}
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-gray-900">
              {videoInfo.title}
            </h1>

            <div className="flex items-center gap-6 text-gray-600">
              <span className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                {videoInfo.views?.toLocaleString() || '0'} 次观看
              </span>
              {videoInfo.rating && (
                <span className="flex items-center gap-2">
                  <Star className="w-5 h-5" />
                  {videoInfo.rating}%
                </span>
              )}
              {videoInfo.duration && (
                <span className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  {videoInfo.duration}
                </span>
              )}
            </div>

            {/* Tags */}
            {videoInfo.tags && videoInfo.tags.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700">标签:</h3>
                <div className="flex flex-wrap gap-2">
                  {videoInfo.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-white text-gray-700 text-sm rounded-full border border-gray-200 hover:border-blue-400 transition-colors"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Pornstars */}
            {videoInfo.pornstars && videoInfo.pornstars.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700">演员:</h3>
                <div className="flex flex-wrap gap-2">
                  {videoInfo.pornstars.map((star, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-200"
                    >
                      {star}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8 mt-12">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="text-center text-gray-500 text-sm">
            <p>© 2024 视频中心. 保留所有权利.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}