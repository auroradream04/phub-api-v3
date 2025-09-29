import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import fs from 'fs/promises'

interface ConversionResult {
  quality: number
  filepath: string
  filesize: number
}

export async function convertVideoToHLS(
  inputPath: string,
  outputDir: string,
  adId: string
): Promise<ConversionResult[]> {
  const qualities = [
    { resolution: '426x240', bitrate: '400k', quality: 240 },
    { resolution: '854x480', bitrate: '800k', quality: 480 },
    { resolution: '1280x720', bitrate: '1500k', quality: 720 },
    { resolution: '1920x1080', bitrate: '3000k', quality: 1080 }
  ]

  // Create output directory if it doesn't exist
  await fs.mkdir(outputDir, { recursive: true })

  const results: ConversionResult[] = []

  for (const { resolution, bitrate, quality } of qualities) {
    const outputPath = path.join(outputDir, `${adId}-${quality}p.ts`)

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            '-c:v libx264',
            '-c:a aac',
            `-s ${resolution}`,
            `-b:v ${bitrate}`,
            '-b:a 128k',
            '-f mpegts',
            '-muxdelay 0',
            '-muxpreload 0',
            '-output_ts_offset 0'
          ])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })

      const stats = await fs.stat(outputPath)
      results.push({
        quality,
        filepath: outputPath.replace(process.cwd() + '/public', ''),
        filesize: stats.size
      })
    } catch (error) {
      console.error(`Failed to convert to ${quality}p:`, error)
      // Continue with other qualities even if one fails
    }
  }

  return results
}