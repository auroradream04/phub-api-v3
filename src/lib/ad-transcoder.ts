/**
 * Ad Transcoding System
 *
 * Automatically creates ad variants to match video formats.
 * When a video with a different fps/resolution is played, the ad
 * is transcoded on-demand and cached for future use.
 */

import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import { existsSync, mkdirSync } from 'fs'
import { readdir, mkdir, unlink, writeFile, readFile } from 'fs/promises'
import { prisma } from './prisma'

// Configure ffmpeg path
function getFFmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static')
    const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic.path || ffmpegStatic.default

    if (ffmpegPath && existsSync(ffmpegPath)) {
      return ffmpegPath
    }
    return null
  } catch {
    return null
  }
}

let ffmpegConfigured = false

function ensureFFmpegConfigured() {
  if (!ffmpegConfigured) {
    const ffmpegPath = getFFmpegPath()
    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath)
      ffmpegConfigured = true
    }
  }
}

/**
 * Video format information
 */
export interface VideoFormat {
  fps: number        // 25, 30, etc.
  width: number      // 1920, 1280, etc.
  height: number     // 1080, 720, etc.
  formatKey: string  // Unique key like "30fps_1280x720"
}

/**
 * Generate a format key for caching
 */
export function getFormatKey(fps: number, width: number, height: number): string {
  return `${fps}fps_${width}x${height}`
}

/**
 * Parse format key back to components
 */
export function parseFormatKey(key: string): { fps: number; width: number; height: number } | null {
  const match = key.match(/^(\d+)fps_(\d+)x(\d+)$/)
  if (!match) return null
  return {
    fps: parseInt(match[1]),
    width: parseInt(match[2]),
    height: parseInt(match[3])
  }
}

/**
 * Probe video format from a .ts segment URL
 * Downloads a small portion and uses ffprobe
 */
export async function probeVideoFormat(segmentUrl: string): Promise<VideoFormat | null> {
  ensureFFmpegConfigured()

  try {
    // Fetch the segment (first 512KB is enough for probing)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(segmentUrl, {
      signal: controller.signal,
      headers: {
        'Range': 'bytes=0-524287', // First 512KB
        'User-Agent': 'Mozilla/5.0'
      }
    })

    clearTimeout(timeout)

    if (!response.ok) {
      console.log(`[AdTranscoder] Failed to fetch segment: ${response.status}`)
      return null
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    // Write to temp file for ffprobe
    const tempPath = path.join(process.cwd(), 'private', 'temp', `probe_${Date.now()}.ts`)
    const tempDir = path.dirname(tempPath)
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    }
    await writeFile(tempPath, buffer)

    // Probe the file
    return new Promise((resolve) => {
      ffmpeg.ffprobe(tempPath, (err, data) => {
        // Clean up temp file
        unlink(tempPath).catch(() => {})

        if (err || !data.streams) {
          console.log(`[AdTranscoder] ffprobe error:`, err?.message)
          resolve(null)
          return
        }

        const videoStream = data.streams.find(s => s.codec_type === 'video')
        if (!videoStream) {
          console.log(`[AdTranscoder] No video stream found`)
          resolve(null)
          return
        }

        // Parse frame rate (can be "25/1", "30000/1001", etc.)
        let fps = 30 // Default
        if (videoStream.r_frame_rate) {
          const parts = videoStream.r_frame_rate.split('/')
          if (parts.length === 2) {
            fps = Math.round(parseInt(parts[0]) / parseInt(parts[1]))
          } else {
            fps = Math.round(parseFloat(videoStream.r_frame_rate))
          }
        }

        const width = videoStream.width || 1280
        const height = videoStream.height || 720

        const format: VideoFormat = {
          fps,
          width,
          height,
          formatKey: getFormatKey(fps, width, height)
        }

        console.log(`[AdTranscoder] Detected format: ${format.formatKey}`)
        resolve(format)
      })
    })
  } catch (error) {
    console.log(`[AdTranscoder] Probe error:`, error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Get path to ad variants directory
 */
function getAdVariantsDir(adId: string): string {
  return path.join(process.cwd(), 'private', 'uploads', 'ads', adId, 'variants')
}

/**
 * Get path to specific variant
 */
function getVariantDir(adId: string, formatKey: string): string {
  return path.join(getAdVariantsDir(adId), formatKey)
}

/**
 * Check if a variant exists for the given format
 */
export async function variantExists(adId: string, formatKey: string): Promise<boolean> {
  const variantDir = getVariantDir(adId, formatKey)

  if (!existsSync(variantDir)) {
    return false
  }

  // Check if there are segment files
  try {
    const files = await readdir(variantDir)
    return files.some(f => f.endsWith('.ts'))
  } catch {
    return false
  }
}

/**
 * Get list of segments for a variant
 */
export async function getVariantSegments(adId: string, formatKey: string): Promise<string[]> {
  const variantDir = getVariantDir(adId, formatKey)

  if (!existsSync(variantDir)) {
    return []
  }

  try {
    const files = await readdir(variantDir)
    return files
      .filter(f => f.endsWith('.ts'))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/\d+/)?.[0] || '0')
        const bNum = parseInt(b.match(/\d+/)?.[0] || '0')
        return aNum - bNum
      })
  } catch {
    return []
  }
}

/**
 * Read a variant segment file
 */
export async function readVariantSegment(adId: string, formatKey: string, segmentIndex: number): Promise<Buffer | null> {
  const variantDir = getVariantDir(adId, formatKey)
  const segmentPath = path.join(variantDir, `segment${String(segmentIndex).padStart(3, '0')}.ts`)

  if (!existsSync(segmentPath)) {
    return null
  }

  try {
    return await readFile(segmentPath)
  } catch {
    return null
  }
}

/**
 * In-memory lock to prevent duplicate transcoding
 */
const transcodingLocks = new Map<string, Promise<boolean>>()

/**
 * Transcode an ad to match the target format
 * Returns true if successful, false otherwise
 */
export async function transcodeAdToFormat(
  adId: string,
  targetFormat: VideoFormat
): Promise<boolean> {
  const lockKey = `${adId}:${targetFormat.formatKey}`

  // Check if already transcoding
  if (transcodingLocks.has(lockKey)) {
    console.log(`[AdTranscoder] Waiting for existing transcode: ${lockKey}`)
    return await transcodingLocks.get(lockKey)!
  }

  // Check if variant already exists
  if (await variantExists(adId, targetFormat.formatKey)) {
    console.log(`[AdTranscoder] Variant already exists: ${lockKey}`)
    return true
  }

  // Create transcoding promise
  const transcodePromise = doTranscode(adId, targetFormat)
  transcodingLocks.set(lockKey, transcodePromise)

  try {
    const result = await transcodePromise
    return result
  } finally {
    // Remove lock after 60 seconds (allow retry if failed)
    setTimeout(() => {
      transcodingLocks.delete(lockKey)
    }, 60000)
  }
}

/**
 * Extract ad folder ID from filepath
 * e.g., "/uploads/ads/a2da30351af19aa1c4fd12229005da9f/segment000.ts" -> "a2da30351af19aa1c4fd12229005da9f"
 */
function extractAdFolderFromPath(filepath: string): string | null {
  // Match pattern: /uploads/ads/{folderId}/ or similar
  const match = filepath.match(/\/ads\/([^/]+)\//)
  return match ? match[1] : null
}

/**
 * Check if a directory has source files (segments or original.mp4)
 */
async function hasSourceFiles(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return false

  try {
    const files = await readdir(dir)
    // Check for original.mp4 or segment files
    return files.some(f =>
      f === 'original.mp4' ||
      (f.startsWith('segment') && f.endsWith('.ts'))
    )
  } catch {
    return false
  }
}

/**
 * Find the ad source directory (check both private and public locations)
 * Also looks up the actual folder path from database if needed
 */
async function findAdSourceDir(adId: string): Promise<string | null> {
  // First try direct ID match - but check for actual source files
  const privateDir = path.join(process.cwd(), 'private', 'uploads', 'ads', adId)
  if (await hasSourceFiles(privateDir)) {
    return privateDir
  }

  const publicDir = path.join(process.cwd(), 'public', 'uploads', 'ads', adId)
  if (await hasSourceFiles(publicDir)) {
    return publicDir
  }

  // ID didn't match folder name - look up from database
  try {
    const ad = await prisma.ad.findUnique({
      where: { id: adId },
      include: { segments: { take: 1 } }
    })

    if (ad?.segments[0]?.filepath) {
      const folderId = extractAdFolderFromPath(ad.segments[0].filepath)
      if (folderId) {
        // Try both locations with the folder ID from database
        const privateDirDb = path.join(process.cwd(), 'private', 'uploads', 'ads', folderId)
        if (await hasSourceFiles(privateDirDb)) {
          return privateDirDb
        }

        const publicDirDb = path.join(process.cwd(), 'public', 'uploads', 'ads', folderId)
        if (await hasSourceFiles(publicDirDb)) {
          return publicDirDb
        }
      }
    }
  } catch (error) {
    console.log(`[AdTranscoder] Error looking up ad from database:`, error)
  }

  return null
}

/**
 * Actual transcoding logic
 */
async function doTranscode(adId: string, targetFormat: VideoFormat): Promise<boolean> {
  ensureFFmpegConfigured()

  const startTime = Date.now()
  console.log(`[AdTranscoder] Starting transcode for ad ${adId} to ${targetFormat.formatKey}`)

  // Get original ad source directory
  const adDir = await findAdSourceDir(adId)

  if (!adDir) {
    console.log(`[AdTranscoder] No source directory found for ad ${adId}`)
    return false
  }

  console.log(`[AdTranscoder] Found source directory: ${adDir}`)

  // Find source file (original.mp4 or concat segments)
  let sourcePath = path.join(adDir, 'original.mp4')

  if (!existsSync(sourcePath)) {
    // Try to find segments and concat them
    const files = await readdir(adDir).catch(() => [] as string[])
    const segments = files
      .filter(f => f.startsWith('segment') && f.endsWith('.ts'))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/\d+/)?.[0] || '0')
        const bNum = parseInt(b.match(/\d+/)?.[0] || '0')
        return aNum - bNum
      })

    if (segments.length === 0) {
      console.log(`[AdTranscoder] No source files found in ${adDir}`)
      return false
    }

    console.log(`[AdTranscoder] Found ${segments.length} source segments to concat`)

    // Create concat file in private temp dir
    const tempDir = path.join(process.cwd(), 'private', 'temp')
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    }
    const concatPath = path.join(tempDir, `concat_${adId}_${Date.now()}.txt`)
    const concatContent = segments.map(s => `file '${path.join(adDir, s)}'`).join('\n')
    await writeFile(concatPath, concatContent)
    sourcePath = concatPath
  }

  // Create variant directory
  const variantDir = getVariantDir(adId, targetFormat.formatKey)
  await mkdir(variantDir, { recursive: true })

  const segmentPattern = path.join(variantDir, 'segment%03d.ts')
  const playlistPath = path.join(variantDir, 'playlist.m3u8')

  // Calculate GOP size (keyframe interval)
  const segmentDuration = 3 // 3 second segments
  const gopSize = targetFormat.fps * segmentDuration

  return new Promise((resolve) => {
    const isConcat = sourcePath.endsWith('.txt')

    let command = ffmpeg()

    if (isConcat) {
      command = command
        .input(sourcePath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
    } else {
      command = command.input(sourcePath)
    }

    // Transcode to target format
    command
      .outputOptions([
        '-c:v libx264',
        '-profile:v high',
        '-level 3.1',
        '-c:a aac',
        `-b:v 800k`,
        '-b:a 128k',
        '-ar 44100',
        '-ac 2',
        `-s ${targetFormat.width}x${targetFormat.height}`,
        `-r ${targetFormat.fps}`,
        '-preset veryfast',
        '-crf 23',
        `-g ${gopSize}`,
        `-keyint_min ${gopSize}`,
        '-sc_threshold 0',
        '-pix_fmt yuv420p',
        '-f hls',
        `-hls_time ${segmentDuration}`,
        '-hls_list_size 0',
        '-hls_flags independent_segments',
        '-hls_segment_filename', segmentPattern
      ])
      .output(playlistPath)
      .on('end', async () => {
        const duration = Date.now() - startTime
        console.log(`[AdTranscoder] Transcode complete for ${adId} to ${targetFormat.formatKey} (${duration}ms)`)

        // Clean up concat file if we created one
        if (isConcat) {
          await unlink(sourcePath).catch(() => {})
        }

        // Delete playlist file (we don't need it)
        await unlink(playlistPath).catch(() => {})

        resolve(true)
      })
      .on('error', async (err) => {
        console.log(`[AdTranscoder] Transcode failed for ${adId}:`, err.message)

        // Clean up on error
        if (isConcat && existsSync(sourcePath)) {
          await unlink(sourcePath).catch(() => {})
        }

        resolve(false)
      })
      .run()
  })
}

/**
 * Get or create ad variant for target format
 * This is the main entry point - blocks until variant is ready
 */
export async function getAdVariantForFormat(
  adId: string,
  targetFormat: VideoFormat
): Promise<{
  success: boolean
  segments: string[]
  formatKey: string
}> {
  // Check if variant exists
  if (await variantExists(adId, targetFormat.formatKey)) {
    const segments = await getVariantSegments(adId, targetFormat.formatKey)
    return { success: true, segments, formatKey: targetFormat.formatKey }
  }

  // Need to transcode
  const success = await transcodeAdToFormat(adId, targetFormat)

  if (!success) {
    return { success: false, segments: [], formatKey: targetFormat.formatKey }
  }

  const segments = await getVariantSegments(adId, targetFormat.formatKey)
  return { success: true, segments, formatKey: targetFormat.formatKey }
}

/**
 * Default format (when we can't probe or for original ads)
 */
export const DEFAULT_FORMAT: VideoFormat = {
  fps: 30,
  width: 1280,
  height: 720,
  formatKey: '30fps_1280x720'
}

/**
 * Check if a format matches the default (no transcoding needed)
 */
export function isDefaultFormat(format: VideoFormat): boolean {
  return format.fps === DEFAULT_FORMAT.fps &&
    format.width === DEFAULT_FORMAT.width &&
    format.height === DEFAULT_FORMAT.height
}
