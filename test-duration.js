import { getVideoDuration } from './dist/lib/ffmpeg-hls.js'

async function test() {
  try {
    const duration = await getVideoDuration('./test_ad.mp4')
    console.log('\n=== FINAL RESULT ===')
    console.log('Duration:', duration, 'seconds')
  } catch (error) {
    console.error('Error:', error)
  }
}

test()