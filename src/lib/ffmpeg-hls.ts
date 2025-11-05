import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import { existsSync } from 'fs'
import { readdir, unlink } from 'fs/promises'

// Dynamically resolve ffmpeg path
function getFFmpegPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static')
    const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic.path || ffmpegStatic.default

    if (ffmpegPath && existsSync(ffmpegPath)) {
      return ffmpegPath
    }

    // Fallback paths
    const possiblePaths = [
      path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
      path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    ]

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p
      }
    }

    return null
  } catch {

    return null
  }
}

// Get ffprobe path (usually in same directory as ffmpeg)
function getFFprobePath(): string | null {
  const ffmpegPath = getFFmpegPath()
  if (!ffmpegPath) return null

  // ffprobe is usually in the same directory as ffmpeg
  const dir = path.dirname(ffmpegPath)
  const ffprobePath = path.join(dir, 'ffprobe')

  if (existsSync(ffprobePath)) {
    return ffprobePath
  }

  // Try with .exe extension on Windows
  const ffprobeExePath = path.join(dir, 'ffprobe.exe')
  if (existsSync(ffprobeExePath)) {
    return ffprobeExePath
  }

  // ffmpeg-static doesn't include ffprobe, so we'll use ffmpeg itself for duration
  return null
}

let ffmpegConfigured = false

function ensureFFmpegConfigured() {
  if (!ffmpegConfigured) {
    const ffmpegPath = getFFmpegPath()
    const ffprobePath = getFFprobePath()

    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath)

      // Only set ffprobe path if it exists
      if (ffprobePath) {
        ffmpeg.setFfprobePath(ffprobePath)

      }

      ffmpegConfigured = true

    }
  }
}

// Get video duration in seconds
export async function getVideoDuration(inputPath: string): Promise<number> {
  ensureFFmpegConfigured()

  return new Promise((resolve, reject) => {
    // Try using ffprobe first if available
    const ffprobePath = getFFprobePath()

    if (ffprobePath) {
      ffmpeg.ffprobe(inputPath, (err, data) => {
        if (err) {
          // Fallback to ffmpeg method if ffprobe fails
          getVideoDurationWithFFmpeg(inputPath).then(resolve).catch(reject)
        } else {
          const _duration = data.format.duration || 0
          resolve(Math.floor(duration))
        }
      })
    } else {
      // Use ffmpeg to get duration when ffprobe is not available
      getVideoDurationWithFFmpeg(inputPath).then(resolve).catch(reject)
    }
  })
}

// Alternative method to get duration using ffmpeg
function getVideoDurationWithFFmpeg(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    let duration = 0

    ffmpeg(inputPath)
      .on('codecData', (data) => {
        // Extract duration from codec data
        if (data.duration) {
          // Duration format is HH:MM:SS.ms (e.g., "00:00:03.00")
          if (typeof data.duration === 'string' && data.duration.includes(':')) {
            const parts = data.duration.split(':')
            if (parts.length === 3) {
              const hours = parseInt(parts[0]) || 0
              const minutes = parseInt(parts[1]) || 0
              const seconds = parseFloat(parts[2]) || 0
              duration = hours * 3600 + minutes * 60 + seconds
            }
          } else if (typeof data.duration === 'number') {
            duration = data.duration
          }
        }
      })
      .on('error', () => {
        // If we can't get duration, default to 10 seconds
        resolve(10)
      })
      .on('end', () => {
        resolve(Math.floor(duration))
      })
      .outputOptions(['-f', 'null'])
      .output('-')
      .run()
  })
}

export interface HLSSegment {
  filename: string
  duration: number
  index: number
}

// Convert video to HLS segments
export async function convertToHLSSegments(
  inputPath: string,
  outputDir: string,
  segmentDuration: number = 3
): Promise<{ segments: HLSSegment[], totalDuration: number }> {
  ensureFFmpegConfigured()

  // Get video duration first
  const totalDuration = await getVideoDuration(inputPath)

  // Clean up any existing segments
  try {
    const files = await readdir(outputDir)
    for (const file of files) {
      if (file.endsWith('.ts') || file === 'playlist.m3u8') {
        await unlink(path.join(outputDir, file))
      }
    }
  } catch {
    // Directory might not exist yet
  }

  return new Promise((resolve, reject) => {
    const playlistPath = path.join(outputDir, 'playlist.m3u8')
    const segmentPattern = path.join(outputDir, 'segment%03d.ts')

    ffmpeg(inputPath)
      .input('anullsrc=channel_layout=stereo:sample_rate=44100')
      .inputFormat('lavfi')
      .outputOptions([
        '-c:v libx264',           // Video codec
        '-profile:v high',        // H.264 High Profile (compatible with most players)
        '-level 3.1',             // H.264 Level 3.1 (matches PornHub)
        '-c:a aac',               // Audio codec (always include)
        '-b:v 800k',              // Video bitrate
        '-b:a 128k',              // Audio bitrate
        '-ar 44100',              // Audio sample rate
        '-ac 2',                  // Stereo audio
        '-s 1280x720',            // Resolution
        '-r 30',                  // Frame rate
        '-preset veryfast',       // Fast encoding
        '-crf 23',                // Quality
        '-g 90',                  // GOP size - 3 seconds at 30fps (matches segment duration)
        '-keyint_min 90',         // Minimum keyframe interval
        '-sc_threshold 0',        // Disable scene change detection
        '-pix_fmt yuv420p',       // Pixel format (compatibility)
        '-movflags +faststart',   // Enable fast start
        '-shortest',              // Match shortest stream (video or audio)
        '-f hls',                 // HLS format
        `-hls_time ${segmentDuration}`, // Segment duration
        '-hls_list_size 0',       // Include all segments in playlist
        '-hls_flags independent_segments', // Make segments independently decodable
        '-hls_segment_filename', segmentPattern
      ])
      .output(playlistPath)
      .on('end', async () => {


        // Read generated segments
        const files = await readdir(outputDir)
        const segments: HLSSegment[] = []

        // Sort segment files numerically
        const segmentFiles = files
          .filter(f => f.startsWith('segment') && f.endsWith('.ts'))
          .sort((a, b) => {
            const aNum = parseInt(a.match(/\d+/)?.[0] || '0')
            const bNum = parseInt(b.match(/\d+/)?.[0] || '0')
            return aNum - bNum
          })



        // Calculate duration for each segment
        segmentFiles.forEach((filename, index) => {
          const isLastSegment = index === segmentFiles.length - 1
          const _duration = isLastSegment
            ? totalDuration - (index * segmentDuration)
            : segmentDuration

          segments.push({
            filename,
            duration,
            index
          })
        })

        // Delete the playlist file, we don't need it
        try {
          await unlink(playlistPath)
        } catch {}

        resolve({ segments, totalDuration })
      })
      .on('error', (err) => {

        reject(err)
      })
      .run()
  })
}

export async function checkFFmpeg(): Promise<boolean> {
  const ffmpegPath = getFFmpegPath()
  return !!ffmpegPath
}
