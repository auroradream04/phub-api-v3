/**
 * Video utility functions for fetching PornHub video data with 2-hour caching
 */

interface VideoData {
  vodId: string
  vodName: string
  vodPic?: string // Thumbnail/preview image
  vodPlayUrl: string // Contains preview video URL
}

/**
 * Fetch video data from PornHub API with 2-hour caching
 * Cache will revalidate every 2 hours (7200 seconds)
 */
export async function getVideoData(
  videoId: string
): Promise<VideoData | null> {
  try {
    // Fetch from your video API endpoint
    // Assuming you have an API route that returns cached video data
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || ''}/api/video/${videoId}`,
      {
        next: {
          revalidate: 7200, // 2 hours cache
        },
      }
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data
  } catch {
    return null
  }
}

/**
 * Extract preview image URL from video data
 */
export function getPreviewImageUrl(videoData: VideoData): string | undefined {
  return videoData.vodPic
}

/**
 * Extract preview video URL from video data
 * The vodPlayUrl format is typically "Episode$URL" where URL is the preview video
 */
export function getPreviewVideoUrl(videoData: VideoData): string | undefined {
  if (!videoData.vodPlayUrl) return undefined

  // Parse the vodPlayUrl to extract preview video URL
  const parts = videoData.vodPlayUrl.split('$')
  if (parts.length >= 2) {
    return parts[1]
  }

  return undefined
}

/**
 * Get full video data with extracted preview URLs
 */
export async function getVideoWithPreviews(videoId: string) {
  const videoData = await getVideoData(videoId)

  if (!videoData) {
    return null
  }

  return {
    ...videoData,
    previewImage: getPreviewImageUrl(videoData),
    previewVideo: getPreviewVideoUrl(videoData),
  }
}
