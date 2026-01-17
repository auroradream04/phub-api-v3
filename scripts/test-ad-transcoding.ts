/**
 * Test ad transcoding system
 * Run: npx tsx scripts/test-ad-transcoding.ts
 */

import {
  probeVideoFormat,
  transcodeAdToFormat,
  variantExists,
  getVariantSegments,
  DEFAULT_FORMAT,
  getFormatKey
} from '../src/lib/ad-transcoder'
import { prisma } from '../src/lib/prisma'
import { existsSync } from 'fs'
import path from 'path'

// Test with a known 25fps video segment
const TEST_25FPS_SEGMENT = 'https://vip8.3sybf.com/20231215/AB1bcLdE/600kb/hls/cfb8b7f1000.ts'

async function main() {
  console.log('🧪 Ad Transcoding System Test')
  console.log('='.repeat(50))

  // Step 1: Get an active ad from the database
  console.log('\n📦 Step 1: Finding active ad...')
  const ad = await prisma.ad.findFirst({
    where: { status: 'active' },
    include: { segments: true }
  })

  if (!ad) {
    console.log('❌ No active ads found in database')
    return
  }

  console.log(`   Found ad: ${ad.id} (${ad.title})`)
  console.log(`   Original segments: ${ad.segments.length}`)

  // Check if ad files exist
  const adDir = path.join(process.cwd(), 'private', 'uploads', 'ads', ad.id)
  console.log(`   Ad directory: ${adDir}`)
  console.log(`   Exists: ${existsSync(adDir)}`)

  // Step 2: Test format probing with a 25fps video
  console.log('\n🔍 Step 2: Probing video format...')
  console.log(`   Test URL: ${TEST_25FPS_SEGMENT.substring(0, 60)}...`)

  const format = await probeVideoFormat(TEST_25FPS_SEGMENT)

  if (!format) {
    console.log('❌ Could not probe video format')
    console.log('   This might be due to network/CORS issues')
    console.log('   Trying with a simpler format detection...')

    // Fallback test with assumed format
    const testFormat = {
      fps: 25,
      width: 1280,
      height: 720,
      formatKey: getFormatKey(25, 1280, 720)
    }
    console.log(`   Using assumed format: ${testFormat.formatKey}`)

    // Step 3: Check if variant exists
    console.log('\n📁 Step 3: Checking for existing variant...')
    const exists = await variantExists(ad.id, testFormat.formatKey)
    console.log(`   Variant exists: ${exists}`)

    if (!exists) {
      console.log('\n⚙️ Step 4: Transcoding ad to match format...')
      console.log(`   Target format: ${testFormat.formatKey}`)
      console.log('   This may take 2-5 seconds...')

      const startTime = Date.now()
      const success = await transcodeAdToFormat(ad.id, testFormat)
      const duration = Date.now() - startTime

      if (success) {
        console.log(`   ✅ Transcode complete (${duration}ms)`)
      } else {
        console.log(`   ❌ Transcode failed (${duration}ms)`)
        return
      }
    }

    // Step 5: Verify variant segments
    console.log('\n📹 Step 5: Verifying variant segments...')
    const segments = await getVariantSegments(ad.id, testFormat.formatKey)
    console.log(`   Variant segments: ${segments.length}`)
    segments.forEach((s, i) => console.log(`     ${i}: ${s}`))

    console.log('\n✅ Ad transcoding system test complete!')
    return
  }

  console.log(`   Detected format: ${format.formatKey}`)
  console.log(`   FPS: ${format.fps}, Resolution: ${format.width}x${format.height}`)

  // Check if this differs from default
  const isDefault = format.fps === DEFAULT_FORMAT.fps &&
    format.width === DEFAULT_FORMAT.width &&
    format.height === DEFAULT_FORMAT.height

  console.log(`   Matches default (30fps 1280x720): ${isDefault}`)

  if (isDefault) {
    console.log('\n✅ Format matches default - no transcoding needed!')
    return
  }

  // Step 3: Check if variant exists
  console.log('\n📁 Step 3: Checking for existing variant...')
  const exists = await variantExists(ad.id, format.formatKey)
  console.log(`   Variant exists: ${exists}`)

  if (!exists) {
    console.log('\n⚙️ Step 4: Transcoding ad to match format...')
    console.log(`   Target format: ${format.formatKey}`)
    console.log('   This may take 2-5 seconds...')

    const startTime = Date.now()
    const success = await transcodeAdToFormat(ad.id, format)
    const duration = Date.now() - startTime

    if (success) {
      console.log(`   ✅ Transcode complete (${duration}ms)`)
    } else {
      console.log(`   ❌ Transcode failed (${duration}ms)`)
      return
    }
  }

  // Step 5: Verify variant segments
  console.log('\n📹 Step 5: Verifying variant segments...')
  const segments = await getVariantSegments(ad.id, format.formatKey)
  console.log(`   Variant segments: ${segments.length}`)
  segments.forEach((s, i) => console.log(`     ${i}: ${s}`))

  console.log('\n✅ Ad transcoding system test complete!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
