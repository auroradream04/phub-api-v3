import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import { existsSync } from 'fs'

// Dynamically resolve ffmpeg path to avoid build-time issues
function getFFmpegPath(): string | null {
  try {
    // Try to require ffmpeg-static at runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static')
    const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic.path || ffmpegStatic.default

    if (ffmpegPath && existsSync(ffmpegPath)) {

      return ffmpegPath
    }

    // Fallback: try common locations
    const possiblePaths = [
      path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
      path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
      path.join(__dirname, '..', '..', 'node_modules', 'ffmpeg-static', 'ffmpeg'),
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

// Set the ffmpeg path when needed
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

export async function convertToTS(inputPath: string, outputPath: string): Promise<void> {
  ensureFFmpegConfigured()

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',     // Video codec
        '-c:a aac',         // Audio codec
        '-b:v 1000k',       // Video bitrate (1Mbps for ads)
        '-b:a 128k',        // Audio bitrate
        '-s 1280x720',      // Scale to 720p
        '-r 30',            // 30 fps
        '-f mpegts',        // MPEG-TS format for HLS
        '-muxdelay 0',      // No mux delay
        '-muxpreload 0',    // No preload
        '-preset veryfast', // Fast encoding
        '-crf 23',          // Quality setting (lower = better quality, bigger file)
      ])
      .output(outputPath)
      .on('end', () => {

        resolve()
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