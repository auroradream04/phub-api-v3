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
 * Download preview video locally
 * Supports: PornHub video ID, m3u8 URL, or direct video file (.webm, .mp4)
 */
export async function downloadPreview(source: string): Promise<{
  m3u8Path: string
  segmentDir: string
} | null> {
  try {
    await ensurePreviewDir()

    let videoUrl: string | null = null
    let isM3u8 = false

    // If it's a full URL
    if (source.startsWith('http')) {
      if (source.includes('.m3u8')) {
        // It's an m3u8 playlist - download all segments
        isM3u8 = true
        videoUrl = source
      } else if (source.includes('.webm') || source.includes('.mp4') || source.includes('.m4v')) {
        // It's a direct video file
        videoUrl = source
      } else {
        console.error('[Preview] URL provided but not a recognized format:', source)
        return null
      }
    } else {
      // Assume it's a PornHub video ID - fetch the preview video using search API
      videoUrl = await fetchPornHubPreview(source)
    }

    if (!videoUrl) {
      console.error('[Preview] Could not determine video URL from source:', source)
      return null
    }

    // Create unique directory for this embed
    const embedId = generateEmbedPreviewId()
    const embedDir = path.join(PREVIEW_DATA_DIR, embedId)
    await mkdir(embedDir, { recursive: true })

    if (isM3u8) {
      // Download m3u8 and all segments
      console.log('[Preview] Downloading m3u8 playlist:', videoUrl.substring(0, 100) + '...')

      const m3u8Content = await downloadM3u8(videoUrl)
      const segments = parseM3u8Segments(m3u8Content, videoUrl)

      console.log('[Preview] Found', segments.length, 'segments to download')

      // Download all segments
      const downloadedSegments: string[] = []
      for (const segment of segments) {
        try {
          const filename = path.basename(segment.url)
          const filepath = path.join(embedDir, filename)
          await downloadSegment(segment.url, filepath)
          downloadedSegments.push(filename)
          console.log('[Preview] Downloaded segment:', filename)
        } catch (err) {
          console.error('[Preview] Failed to download segment:', segment.url, err)
        }
      }

      // Create local m3u8 that references our hosted segments
      const localM3u8Path = path.join(embedDir, 'index.m3u8')
      const localM3u8Content = createLocalM3u8(m3u8Content, downloadedSegments, embedId)
      await fs.writeFile(localM3u8Path, localM3u8Content, 'utf-8')

      console.log('[Preview] Successfully downloaded m3u8 preview:', embedId)

      return {
        m3u8Path: `embed-previews/${embedId}/index.m3u8`,
        segmentDir: `embed-previews/${embedId}`,
      }
    } else {
      // Download single video file (.webm, .mp4)
      console.log('[Preview] Downloading video file:', videoUrl.substring(0, 100) + '...')

      const extension = videoUrl.includes('.webm') ? 'webm' : 'mp4'
      const filename = `preview.${extension}`
      const filepath = path.join(embedDir, filename)

      await downloadVideoFile(videoUrl, filepath)

      console.log('[Preview] Successfully downloaded video:', embedId)

      return {
        m3u8Path: `embed-previews/${embedId}/${filename}`, // Store path to video file
        segmentDir: `embed-previews/${embedId}`,
      }
    }
  } catch (error) {
    console.error('[Preview] Error downloading preview:', error)
    return null
  }
}

/**
 * Fetch PornHub preview m3u8 URL using search API
 */
async function fetchPornHubPreview(videoId: string): Promise<string | null> {
  try {
    const proxyInfo = getRandomProxy('Preview Download')
    const pornhub = new PornHub()

    if (proxyInfo) {
      pornhub.setAgent(proxyInfo.agent)
    }

    // First get video details to get the title
    const video = await pornhub.video(videoId)

    if (!video || !video.title) {
      console.error('[Preview] Video not found or has no title:', videoId)
      return null
    }

    console.log('[Preview] Searching for video:', video.title)

    // Search for the video by title to get previewVideo (m3u8 URL)
    const searchResults = await pornhub.searchVideo(video.title, { page: 1 })

    // Find the matching video in search results
    const matchedVideo = searchResults.data.find(v => v.id === videoId)

    if (matchedVideo?.previewVideo) {
      console.log('[Preview] Found m3u8 URL:', matchedVideo.previewVideo.substring(0, 100) + '...')
      return matchedVideo.previewVideo
    }

    console.error('[Preview] No previewVideo found in search results for:', videoId)
    return null
  } catch (error) {
    console.error('[Preview] Error fetching PornHub preview:', error)
    return null
  }
}

/**
 * Download m3u8 file content
 */
async function downloadM3u8(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download m3u8: ${response.statusText}`)
  }
  return response.text()
}

/**
 * Parse m3u8 to extract segment URLs
 */
function parseM3u8Segments(
  content: string,
  baseUrl: string
): Array<{ url: string; duration: number }> {
  const segments: Array<{ url: string; duration: number }> = []
  const lines = content.split('\n')
  let currentDuration = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith('#EXTINF:')) {
      // Extract duration
      const match = line.match(/#EXTINF:([\d.]+)/)
      currentDuration = match ? parseFloat(match[1]) : 0
    } else if (line && !line.startsWith('#')) {
      // This is a segment URL
      const segmentUrl = line.startsWith('http') ? line : new URL(line, baseUrl).toString()
      segments.push({
        url: segmentUrl,
        duration: currentDuration,
      })
    }
  }

  return segments
}

/**
 * Download a single segment
 */
async function downloadSegment(url: string, filepath: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download segment: ${response.statusText}`)
  }

  const buffer = await response.arrayBuffer()
  await fs.writeFile(filepath, Buffer.from(buffer))
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
 * Create local m3u8 that points to our API endpoints
 */
function createLocalM3u8(content: string, downloadedSegments: string[], embedId: string): string {
  const lines = content.split('\n')
  let result = ''

  for (const line of lines) {
    if (!line.trim()) {
      result += '\n'
      continue
    }

    if (line.startsWith('#')) {
      // Keep header lines as-is
      result += line + '\n'
    } else if (line.trim() && !line.startsWith('#')) {
      // Replace segment URL with our local endpoint
      const filename = path.basename(line)
      if (downloadedSegments.includes(filename)) {
        result += `/api/embed-previews/${embedId}/${filename}\n`
      }
    }
  }

  return result
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
 * Read m3u8 file from disk
 */
export async function readM3u8(embedId: string): Promise<string | null> {
  try {
    const filepath = path.join(PREVIEW_DATA_DIR, embedId, 'index.m3u8')

    // Security: prevent directory traversal
    const resolved = path.resolve(filepath)
    const allowed = path.resolve(PREVIEW_DATA_DIR)
    if (!resolved.startsWith(allowed)) {
      throw new Error('Invalid path')
    }

    return await fs.readFile(resolved, 'utf-8')
  } catch (error) {
    console.error('[Preview] Error reading m3u8:', error)
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
