import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import path from 'path'

// Set the path to the portable ffmpeg binary
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath)
}

export async function convertToTS(inputPath: string, outputPath: string): Promise<void> {
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
  // ffmpeg-static always provides ffmpeg, so return true
  return !!ffmpegPath
}