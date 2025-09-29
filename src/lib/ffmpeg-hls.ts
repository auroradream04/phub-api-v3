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
  } catch (error) {
    console.error('Error loading ffmpeg-static:', error)
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
      console.log('FFmpeg configured:', ffmpegPath)
    }
  }
}

// Get video duration in seconds
export async function getVideoDuration(inputPath: string): Promise<number> {
  ensureFFmpegConfigured()

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) {
        reject(err)
      } else {
        const duration = data.format.duration || 0
        resolve(Math.floor(duration))
      }
    })
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
  console.log(`Video duration: ${totalDuration} seconds`)

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
      .outputOptions([
        '-c:v libx264',           // Video codec
        '-c:a aac',               // Audio codec
        '-b:v 800k',              // Video bitrate
        '-b:a 128k',              // Audio bitrate
        '-s 1280x720',            // Resolution
        '-r 30',                  // Frame rate
        '-preset veryfast',       // Fast encoding
        '-crf 23',                // Quality
        '-f hls',                 // HLS format
        `-hls_time ${segmentDuration}`, // Segment duration
        '-hls_list_size 0',       // Include all segments in playlist
        '-hls_segment_filename', segmentPattern
      ])
      .output(playlistPath)
      .on('end', async () => {
        console.log('HLS conversion complete')

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
          const duration = isLastSegment
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
        console.error('FFmpeg error:', err)
        reject(err)
      })
      .run()
  })
}

export async function checkFFmpeg(): Promise<boolean> {
  const ffmpegPath = getFFmpegPath()
  return !!ffmpegPath
}