import fs from 'fs/promises'
import path from 'path'
import { mkdir } from 'fs/promises'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from './proxy'

const PREVIEW_DATA_DIR = path.join(process.cwd(), 'data', 'embed-previews')

/**
 * Ensure the preview data directory exists
 */
export async function ensurePreviewDir() {
  try {
    await mkdir(PREVIEW_DATA_DIR, { recursive: true })
  } catch (error) {
    console.error('[Preview] Error creating preview directory:', error)
  }
}

/**
 * Download preview video file locally
 * Supports: PornHub video ID, direct video URL (.webm, .mp4)
 */
export async function downloadPreview(source: string): Promise<{
  videoPath: string
  videoUrl: string
} | null> {
  try {
    await ensurePreviewDir()

    let videoUrl: string | null = null

    // If it's a full URL (direct video file)
    if (source.startsWith('http')) {
      if (source.includes('.webm') || source.includes('.mp4') || source.includes('.m4v')) {
        videoUrl = source
      } else {
        console.error('[Preview] URL provided but not a video file (.webm, .mp4):', source)
        return null
      }
    } else {
      // Assume it's a PornHub video ID, fetch the preview video URL
      videoUrl = await fetchPornHubPreviewVideo(source)
    }

    if (!videoUrl) {
      console.error('[Preview] Could not determine video URL from source:', source)
      return null
    }

    console.log('[Preview] Downloading preview video:', videoUrl.substring(0, 100) + '...')

    // Create unique directory for this embed
    const embedId = generateEmbedPreviewId()
    const embedDir = path.join(PREVIEW_DATA_DIR, embedId)
    await mkdir(embedDir, { recursive: true })

    // Download the video file
    const extension = videoUrl.includes('.webm') ? 'webm' : 'mp4'
    const filename = `preview.${extension}`
    const filepath = path.join(embedDir, filename)

    await downloadVideoFile(videoUrl, filepath)

    console.log('[Preview] Successfully downloaded preview:', embedId)

    return {
      videoPath: `embed-previews/${embedId}/${filename}`,
      videoUrl: `/api/embed-previews/${embedId}/${filename}`,
    }
  } catch (error) {
    console.error('[Preview] Error downloading preview:', error)
    return null
  }
}

/**
 * Fetch PornHub preview video URL using search API
 */
async function fetchPornHubPreviewVideo(videoId: string): Promise<string | null> {
  try {
    const proxyInfo = getRandomProxy('Preview Download')

    // Fetch video info via the internal API (same as embeds/fetch-video)
    const response = await fetch(`http://localhost:${process.env.PORT || 4444}/api/admin/embeds/fetch-video?q=${videoId}`, {
      headers: proxyInfo ? {
        'User-Agent': 'Mozilla/5.0',
      } : {},
    })

    if (!response.ok) {
      console.error('[Preview] Failed to fetch video info:', response.statusText)
      return null
    }

    const videoData = await response.json()

    // Return the previewVideo URL
    if (videoData.previewVideo) {
      console.log('[Preview] Found preview video URL:', videoData.previewVideo.substring(0, 80) + '...')
      return videoData.previewVideo
    }

    console.error('[Preview] No previewVideo in response')
    return null
  } catch (error) {
    console.error('[Preview] Error fetching PornHub preview video:', error)
    return null
  }
}

/**
 * Download a video file
 */
async function downloadVideoFile(url: string, filepath: string): Promise<void> {
  console.log('[Preview] Fetching video file...')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`)
  }

  const buffer = await response.arrayBuffer()
  await fs.writeFile(filepath, Buffer.from(buffer))

  console.log('[Preview] Video file saved:', filepath, `(${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`)
}

/**
 * Generate unique ID for preview
 */
function generateEmbedPreviewId(): string {
  return `preview_${Date.now()}_${Math.random().toString(36).substring(7)}`
}

/**
 * Read segment file from disk
 */
export async function readSegment(embedId: string, filename: string): Promise<Buffer | null> {
  try {
    const filepath = path.join(PREVIEW_DATA_DIR, embedId, filename)

    // Security: prevent directory traversal
    const resolved = path.resolve(filepath)
    const allowed = path.resolve(PREVIEW_DATA_DIR)
    if (!resolved.startsWith(allowed)) {
      throw new Error('Invalid path')
    }

    return await fs.readFile(resolved)
  } catch (error) {
    console.error('[Preview] Error reading segment:', error)
    return null
  }
}

/**
 * Read video file from disk
 */
export async function readVideo(embedId: string, filename: string): Promise<Buffer | null> {
  try {
    const filepath = path.join(PREVIEW_DATA_DIR, embedId, filename)

    // Security: prevent directory traversal
    const resolved = path.resolve(filepath)
    const allowed = path.resolve(PREVIEW_DATA_DIR)
    if (!resolved.startsWith(allowed)) {
      throw new Error('Invalid path')
    }

    return await fs.readFile(resolved)
  } catch (error) {
    console.error('[Preview] Error reading video:', error)
    return null
  }
}

/**
 * Delete preview files for an embed
 */
export async function deletePreview(embedId: string): Promise<void> {
  try {
    const segmentDir = path.join(PREVIEW_DATA_DIR, embedId)

    // Security: prevent directory traversal
    const resolved = path.resolve(segmentDir)
    const allowed = path.resolve(PREVIEW_DATA_DIR)
    if (!resolved.startsWith(allowed)) {
      throw new Error('Invalid path')
    }

    await fs.rm(segmentDir, { recursive: true, force: true })
    console.log('[Preview] Deleted preview:', embedId)
  } catch (error) {
    console.error('[Preview] Error deleting preview:', error)
  }
}
