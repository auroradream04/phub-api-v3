/**
 * Test CDN ad stripping functionality
 * Run: npx tsx scripts/test-cdn-ad-strip.ts
 */

// Test m3u8 with CDN pre-roll ad pattern (simulated)
const TEST_M3U8_WITH_CDN_AD = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=NONE
#EXTINF:3.0,
https://cdn.example.com/ad/segment1.ts
#EXTINF:3.0,
https://cdn.example.com/ad/segment2.ts
#EXTINF:3.0,
https://cdn.example.com/ad/segment3.ts
#EXT-X-DISCONTINUITY
#EXT-X-KEY:METHOD=AES-128,URI="/hls/key.key",IV=0x12345678
#EXTINF:3.0,
https://cdn.example.com/video/segment1.ts
#EXTINF:3.0,
https://cdn.example.com/video/segment2.ts
#EXTINF:3.0,
https://cdn.example.com/video/segment3.ts
#EXT-X-ENDLIST`

// Test m3u8 without CDN ad (just encrypted video)
const TEST_M3U8_NO_AD = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="/hls/key.key",IV=0x12345678
#EXTINF:3.0,
https://cdn.example.com/video/segment1.ts
#EXTINF:3.0,
https://cdn.example.com/video/segment2.ts
#EXTINF:3.0,
https://cdn.example.com/video/segment3.ts
#EXT-X-ENDLIST`

// Inline the stripCdnPrerollAds function for testing
function stripCdnPrerollAds(m3u8Content: string): {
  content: string
  strippedSegments: number
} {
  const lines = m3u8Content.split('\n')

  // Find the first DISCONTINUITY
  let firstDiscontinuityIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '#EXT-X-DISCONTINUITY') {
      firstDiscontinuityIndex = i
      break
    }
  }

  // No discontinuity = no CDN ad pattern
  if (firstDiscontinuityIndex === -1) {
    return { content: m3u8Content, strippedSegments: 0 }
  }

  // Check what comes after the discontinuity
  let hasEncryptionAfterDiscontinuity = false
  for (let i = firstDiscontinuityIndex + 1; i < lines.length && i < firstDiscontinuityIndex + 5; i++) {
    if (lines[i].includes('#EXT-X-KEY:') && lines[i].includes('METHOD=AES-128')) {
      hasEncryptionAfterDiscontinuity = true
      break
    }
  }

  // Check if content before discontinuity is unencrypted or has METHOD=NONE
  let isUnencryptedBeforeDiscontinuity = true
  for (let i = 0; i < firstDiscontinuityIndex; i++) {
    if (lines[i].includes('#EXT-X-KEY:') && lines[i].includes('METHOD=AES-128')) {
      isUnencryptedBeforeDiscontinuity = false
      break
    }
  }

  // CDN ad pattern: unencrypted before DISCONTINUITY, encrypted after
  if (!isUnencryptedBeforeDiscontinuity || !hasEncryptionAfterDiscontinuity) {
    return { content: m3u8Content, strippedSegments: 0 }
  }

  // Count segments being stripped (before discontinuity)
  let strippedSegments = 0
  for (let i = 0; i < firstDiscontinuityIndex; i++) {
    if (lines[i].startsWith('#EXTINF:')) {
      strippedSegments++
    }
  }

  // Only strip if it looks like a reasonable ad (< 60 seconds worth)
  if (strippedSegments > 20) {
    console.log(`Found ${strippedSegments} segments before DISCONTINUITY - too many for an ad, skipping strip`)
    return { content: m3u8Content, strippedSegments: 0 }
  }

  console.log(`Detected CDN pre-roll ad: ${strippedSegments} segments, stripping...`)

  // Build new m3u8 without the CDN ad
  const result: string[] = []
  let foundFirstDiscontinuity = false
  let skippingInitialKey = true

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Copy header tags always
    if (
      line.startsWith('#EXTM3U') ||
      line.startsWith('#EXT-X-VERSION') ||
      line.startsWith('#EXT-X-TARGETDURATION') ||
      line.startsWith('#EXT-X-MEDIA-SEQUENCE') ||
      line.startsWith('#EXT-X-PLAYLIST-TYPE') ||
      line.startsWith('#EXT-X-ALLOW-CACHE')
    ) {
      result.push(line)
      continue
    }

    // Skip the initial METHOD=NONE key
    if (skippingInitialKey && line.includes('#EXT-X-KEY:') && line.includes('METHOD=NONE')) {
      continue
    }

    // Once we hit the first DISCONTINUITY, stop skipping
    if (!foundFirstDiscontinuity && line.trim() === '#EXT-X-DISCONTINUITY') {
      foundFirstDiscontinuity = true
      // Don't include the DISCONTINUITY itself - our ad will add one
      continue
    }

    // Skip content before first discontinuity (the CDN ad)
    if (!foundFirstDiscontinuity) {
      continue
    }

    // After discontinuity, include everything
    skippingInitialKey = false
    result.push(line)
  }

  return {
    content: result.join('\n'),
    strippedSegments
  }
}

async function main() {
  console.log('CDN Ad Strip Test')
  console.log('='.repeat(50))

  // Test 1: M3U8 with CDN ad
  console.log('\n--- Test 1: M3U8 WITH CDN Ad ---')
  console.log('Input has:')
  console.log('  - METHOD=NONE (unencrypted ad)')
  console.log('  - 3 ad segments')
  console.log('  - DISCONTINUITY')
  console.log('  - METHOD=AES-128 (encrypted video)')
  console.log('  - 3 video segments')

  const result1 = stripCdnPrerollAds(TEST_M3U8_WITH_CDN_AD)
  console.log(`\nResult: Stripped ${result1.strippedSegments} segments`)
  console.log('\nCleaned M3U8:')
  console.log(result1.content)

  // Verify the result
  const hasNoAd = !result1.content.includes('ad/segment')
  const hasVideo = result1.content.includes('video/segment')
  const hasEncryption = result1.content.includes('METHOD=AES-128')
  const noDiscontinuity = !result1.content.includes('DISCONTINUITY')

  console.log(`\nValidation:`)
  console.log(`  - Ad segments removed: ${hasNoAd ? 'YES' : 'NO'}`)
  console.log(`  - Video segments kept: ${hasVideo ? 'YES' : 'NO'}`)
  console.log(`  - Encryption key kept: ${hasEncryption ? 'YES' : 'NO'}`)
  console.log(`  - Original DISCONTINUITY removed: ${noDiscontinuity ? 'YES' : 'NO'}`)

  // Test 2: M3U8 without CDN ad
  console.log('\n\n--- Test 2: M3U8 WITHOUT CDN Ad ---')
  console.log('Input has only encrypted video segments')

  const result2 = stripCdnPrerollAds(TEST_M3U8_NO_AD)
  console.log(`\nResult: Stripped ${result2.strippedSegments} segments`)
  console.log(`Content unchanged: ${result2.content === TEST_M3U8_NO_AD ? 'YES' : 'NO'}`)

  // Test 3: Live URL test (optional)
  const LIVE_TEST_URL = 'https://vip8.3sybf.com/20231215/AB1bcLdE/600kb/hls/index.m3u8'

  console.log('\n\n--- Test 3: Live URL Test ---')
  console.log(`Fetching: ${LIVE_TEST_URL}`)

  try {
    const response = await fetch(LIVE_TEST_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    })

    if (!response.ok) {
      console.log(`Failed to fetch: ${response.status}`)
    } else {
      const liveM3u8 = await response.text()
      console.log(`\nFetched ${liveM3u8.split('\n').length} lines`)

      // Count segments before
      const segmentsBefore = (liveM3u8.match(/#EXTINF:/g) || []).length
      const hasDiscontinuity = liveM3u8.includes('#EXT-X-DISCONTINUITY')
      const hasMethodNone = liveM3u8.includes('METHOD=NONE')

      console.log(`\nOriginal playlist:`)
      console.log(`  - Segments: ${segmentsBefore}`)
      console.log(`  - Has DISCONTINUITY: ${hasDiscontinuity}`)
      console.log(`  - Has METHOD=NONE: ${hasMethodNone}`)

      const liveResult = stripCdnPrerollAds(liveM3u8)
      const segmentsAfter = (liveResult.content.match(/#EXTINF:/g) || []).length

      console.log(`\nAfter stripping:`)
      console.log(`  - Stripped segments: ${liveResult.strippedSegments}`)
      console.log(`  - Remaining segments: ${segmentsAfter}`)
    }
  } catch (error) {
    console.log(`Error fetching live URL: ${error instanceof Error ? error.message : error}`)
  }

  console.log('\n' + '='.repeat(50))
  console.log('CDN Ad Strip Test Complete')
}

main().catch(console.error)
