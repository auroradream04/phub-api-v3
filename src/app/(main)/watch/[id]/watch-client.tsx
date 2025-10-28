'use client'

import { useEffect, useState, useRef } from 'react'
import Hls from 'hls.js'

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
  categories?: Array<{ id?: number; name: string }>
}

export default function WatchClient({ videoInfo }: { videoInfo: VideoInfo }) {
  const [selectedQuality, setSelectedQuality] = useState<number | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  // Set default quality on mount
  useEffect(() => {
    if (videoInfo.mediaDefinitions && videoInfo.mediaDefinitions.length > 0) {
      const qualities = videoInfo.mediaDefinitions
        .filter((md: MediaDefinition) => md.format === 'hls')
        .sort((a: MediaDefinition, b: MediaDefinition) => b.quality - a.quality)

      if (qualities.length > 0) {
        setSelectedQuality(qualities[0].quality)
      }
    }
  }, [videoInfo])

  // Handle HLS player setup
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

  return (
    <div className="w-full aspect-video bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        playsInline
        poster={videoInfo.preview}
      />
    </div>
  )
}
