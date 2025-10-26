'use client'

import Image from 'next/image'
import { useState, useRef } from 'react'

interface VideoPreviewProps {
  preview: string
  previewVideo?: string
  title: string
  duration: string
  className?: string
}

export default function VideoPreview({
  preview,
  previewVideo,
  title,
  duration,
  className = '',
}: VideoPreviewProps) {
  const [isHovering, setIsHovering] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleMouseEnter = () => {
    console.log('[VideoPreview] Mouse entered, previewVideo:', previewVideo ? 'YES' : 'NO')
    if (!previewVideo) {
      console.warn('[VideoPreview] No preview video available for:', title)
      return
    }
    setIsHovering(true)
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch((err) => {
        // Autoplay might fail in some browsers
        console.error('Preview video autoplay failed:', err)
        setIsHovering(false)
      })
    }
  }

  const handleMouseLeave = () => {
    setIsHovering(false)
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }

  return (
    <div
      className={`relative w-full h-48 bg-muted overflow-hidden ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Static Thumbnail Image */}
      <Image
        src={preview}
        alt={title}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className={`object-cover group-hover:scale-110 transition-transform duration-300 ${
          isHovering && previewVideo ? 'opacity-0' : 'opacity-100'
        } transition-opacity`}
      />

      {/* Preview Video - Only render if available */}
      {previewVideo && (
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover ${
            isHovering ? 'opacity-100' : 'opacity-0'
          } transition-opacity duration-200`}
          muted
          loop
          playsInline
          autoPlay={false}
          onError={() => {
            // If video fails to load, just stay with the image
            console.debug('Preview video failed to load')
          }}
        >
          <source src={previewVideo} type="video/webm" />
        </video>
      )}

      {/* Duration Badge */}
      <div className="absolute bottom-2 right-2 bg-black/90 text-white text-xs px-2 py-1 rounded backdrop-blur-sm z-10">
        {duration}
      </div>
    </div>
  )
}
