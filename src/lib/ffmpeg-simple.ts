import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import { existsSync } from 'fs'

// Dynamically resolve ffmpeg path to avoid build-time issues
function getFFmpegPath(): string | null {
  try {
    // Try to require ffmpeg-static at runtime
    const ffmpegStatic = require('ffmpeg-static')
    const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic.path || ffmpegStatic.default

    if (ffmpegPath && existsSync(ffmpegPath)) {
      console.log('FFmpeg found at:', ffmpegPath)
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
        console.log('FFmpeg found at fallback path:', p)
        return p
      }
    }

    console.error('FFmpeg binary not found in any expected location')
    return null
  } catch (error) {
    console.error('Error loading ffmpeg-static:', error)
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
        '-f mpegts',        // MPEG-TS format for HLS
        '-muxdelay 0',      // No mux delay
        '-muxpreload 0',    // No preload
        '-preset fast',     // Fast encoding for ads
      ])
      .output(outputPath)
      .on('end', () => {
        console.log(`Successfully converted to .ts: ${path.basename(outputPath)}`)
        resolve()
      })
      .on('error', (err) => {
        console.error('FFmpeg conversion error:', err)
        reject(err)
      })
      .run()
  })
}

export async function checkFFmpeg(): Promise<boolean> {
  const ffmpegPath = getFFmpegPath()
  return !!ffmpegPath
}