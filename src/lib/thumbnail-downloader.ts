import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const THUMBNAIL_DATA_DIR = path.join(process.cwd(), 'data', 'thumbnails')

/**
 * Ensure the thumbnail data directory exists
 */
export async function ensureThumbnailDir(): Promise<void> {
  try {
    await fs.mkdir(THUMBNAIL_DATA_DIR, { recursive: true })
  } catch (error) {
    console.error('[Thumbnail] Error creating thumbnail directory:', error)
  }
}

/**
 * Get the file path for a thumbnail
 */
export function getThumbnailPath(vodId: string): string {
  // Sanitize vodId to prevent directory traversal
  const safeVodId = vodId.replace(/[^a-zA-Z0-9_-]/g, '')
  return path.join(THUMBNAIL_DATA_DIR, `${safeVodId}.jpg`)
}

/**
 * Get the API URL for a thumbnail (absolute URL)
 */
export function getThumbnailApiUrl(vodId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  return `${baseUrl}/api/thumbnails/${vodId}`
}

/**
 * Check if a thumbnail exists locally
 */
export function thumbnailExists(vodId: string): boolean {
  return existsSync(getThumbnailPath(vodId))
}

/**
 * Download a thumbnail from a remote URL and save locally
 * Returns true on success, false on failure
 */
export async function downloadThumbnail(
  vodId: string,
  remoteUrl: string
): Promise<boolean> {
  try {
    await ensureThumbnailDir()

    // Skip if already exists
    if (thumbnailExists(vodId)) {
      return true
    }

    // Skip invalid URLs
    if (!remoteUrl || !remoteUrl.startsWith('http')) {
      console.warn(`[Thumbnail] Invalid URL for ${vodId}: ${remoteUrl}`)
      return false
    }

    const response = await fetch(remoteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!response.ok) {
      console.warn(`[Thumbnail] Failed to download ${vodId}: ${response.status}`)
      return false
    }

    const buffer = await response.arrayBuffer()

    // Validate it's actually an image (check minimum size and magic bytes)
    if (buffer.byteLength < 100) {
      console.warn(`[Thumbnail] File too small for ${vodId}: ${buffer.byteLength} bytes`)
      return false
    }

    // Check JPEG magic bytes (FFD8FF) or PNG (89504E47)
    const header = new Uint8Array(buffer.slice(0, 4))
    const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
    const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47

    if (!isJpeg && !isPng) {
      console.warn(`[Thumbnail] Invalid image format for ${vodId}`)
      return false
    }

    const filepath = getThumbnailPath(vodId)
    await fs.writeFile(filepath, Buffer.from(buffer))

    return true
  } catch (error) {
    console.error(`[Thumbnail] Error downloading ${vodId}:`, error)
    return false
  }
}

/**
 * Read a thumbnail from disk
 * Returns null if not found
 */
export async function readThumbnail(vodId: string): Promise<Buffer | null> {
  try {
    const filepath = getThumbnailPath(vodId)

    // Security: prevent directory traversal
    const resolved = path.resolve(filepath)
    const allowed = path.resolve(THUMBNAIL_DATA_DIR)
    if (!resolved.startsWith(allowed)) {
      console.error('[Thumbnail] Directory traversal attempt:', vodId)
      return null
    }

    if (!existsSync(resolved)) {
      return null
    }

    return await fs.readFile(resolved)
  } catch (error) {
    console.error(`[Thumbnail] Error reading ${vodId}:`, error)
    return null
  }
}

/**
 * Delete a thumbnail from disk
 */
export async function deleteThumbnail(vodId: string): Promise<boolean> {
  try {
    const filepath = getThumbnailPath(vodId)

    // Security: prevent directory traversal
    const resolved = path.resolve(filepath)
    const allowed = path.resolve(THUMBNAIL_DATA_DIR)
    if (!resolved.startsWith(allowed)) {
      return false
    }

    if (existsSync(resolved)) {
      await fs.unlink(resolved)
    }
    return true
  } catch (error) {
    console.error(`[Thumbnail] Error deleting ${vodId}:`, error)
    return false
  }
}

/**
 * Get stats about the thumbnail directory
 */
export async function getThumbnailStats(): Promise<{
  count: number
  totalSizeBytes: number
  totalSizeMB: number
}> {
  try {
    await ensureThumbnailDir()

    const files = await fs.readdir(THUMBNAIL_DATA_DIR)
    let totalSize = 0

    for (const file of files) {
      if (file.endsWith('.jpg') || file.endsWith('.png')) {
        const stat = await fs.stat(path.join(THUMBNAIL_DATA_DIR, file))
        totalSize += stat.size
      }
    }

    return {
      count: files.filter(f => f.endsWith('.jpg') || f.endsWith('.png')).length,
      totalSizeBytes: totalSize,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
    }
  } catch {
    return { count: 0, totalSizeBytes: 0, totalSizeMB: 0 }
  }
}

/**
 * Download thumbnail and return the local API URL
 * Falls back to original URL if download fails
 */
export async function downloadAndGetLocalPath(
  vodId: string,
  remoteUrl: string | undefined
): Promise<string | undefined> {
  if (!remoteUrl) return undefined

  const success = await downloadThumbnail(vodId, remoteUrl)

  if (success) {
    return getThumbnailApiUrl(vodId)
  }

  // Fallback to remote URL if download failed
  return remoteUrl
}
