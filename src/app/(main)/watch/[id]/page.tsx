'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, Star, Clock, ChevronLeft, User } from 'lucide-react'
import Hls from 'hls.js'
import HorizontalAdsSlider from '@/components/HorizontalAdsSlider'
import VideoPreview from '@/components/VideoPreview'

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
  provider?: string
}

interface RecommendedVideo {
  id: string
  title: string
  preview: string
  previewVideo?: string
  duration: string
  views: string
  provider?: string
}

export default function WatchPage() {
  const params = useParams()
  const videoId = params.id as string

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [recommendedVideos, setRecommendedVideos] = useState<RecommendedVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedQuality, setSelectedQuality] = useState<number | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  useEffect(() => {
    // Fetch video info first
    const fetchData = async () => {
      try {
        const videoResponse = await fetch(`/api/watch/${videoId}`)
        const videoData = await videoResponse.json()

        setVideoInfo(videoData)

        // If provider is available, fetch videos from same provider
        if (videoData.provider) {
          try {
            const providerResponse = await fetch(
              `/api/videos/by-provider?provider=${encodeURIComponent(videoData.provider)}&exclude=${videoId}&limit=6`
            )
            const providerData = await providerResponse.json()

            if (providerData?.data) {
              setRecommendedVideos(providerData.data)
            }
          } catch (providerErr) {
            // If provider fetch fails, just skip recommendations
            console.warn('Failed to fetch provider videos:', providerErr)
          }
        }

        // Select highest quality by default
        if (videoData.mediaDefinitions && videoData.mediaDefinitions.length > 0) {
          const qualities = videoData.mediaDefinitions
            .filter((md: MediaDefinition) => md.format === 'hls')
            .sort((a: MediaDefinition, b: MediaDefinition) => b.quality - a.quality)

          if (qualities.length > 0) {
            setSelectedQuality(qualities[0].quality)
          }
        }

        setLoading(false)
      } catch {
        setError('无法加载视频信息')
        setLoading(false)
      }
    }

    fetchData()
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

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              break
          }
        }
      })

      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = videoSrc
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
    }
  }, [videoInfo, selectedQuality])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-6">
            <div className="w-full aspect-video bg-muted rounded-lg"></div>
            <div className="h-8 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !videoInfo) {
    return (
      <div className="min-h-screen bg-background">
        <div className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-red-500 text-lg mb-4">{error || '视频未找到'}</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-primary hover:text-primary/80"
            >
              <ChevronLeft className="w-5 h-5" />
              返回首页
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
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
            <h1 className="text-xl font-bold text-foreground">
              {videoInfo.title}
            </h1>

            <div className="flex items-center gap-6 text-muted-foreground">
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
                <h3 className="text-sm font-medium text-foreground">标签:</h3>
                <div className="flex flex-wrap gap-2">
                  {videoInfo.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-card text-foreground text-sm rounded-full border border-border hover:border-primary transition-colors"
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
                <h3 className="text-sm font-medium text-foreground">演员:</h3>
                <div className="flex flex-wrap gap-2">
                  {videoInfo.pornstars.map((star, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-full border border-primary/20"
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

      {/* Recommended Videos */}
      {recommendedVideos.length > 0 && (
        <section className="py-12 px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {videoInfo?.provider ? `更多来自 ${videoInfo.provider} 的视频` : '推荐视频'}
            </h2>
            <div className="h-1 w-20 bg-gradient-to-r from-primary to-accent rounded-full"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendedVideos.map((video) => (
              <Link
                key={video.id}
                href={`/watch/${video.id}`}
                className="bg-card rounded-xl overflow-hidden border border-border hover:border-primary transition-all group"
              >
                <VideoPreview
                  preview={video.preview}
                  previewVideo={video.previewVideo}
                  title={video.title}
                  duration={video.duration}
                  className="group-hover:scale-110 transition-transform duration-300"
                />
                <div className="p-4">
                  <h3 className="font-medium text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                    {video.title}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1 leading-none">
                      <Eye className="w-4 h-4" />
                      <span className="leading-none">{video.views}</span>
                    </span>
                    {video.provider && (
                      <span className="flex items-center gap-1 max-w-[120px] leading-none">
                        <User className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate leading-none">{video.provider}</span>
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}