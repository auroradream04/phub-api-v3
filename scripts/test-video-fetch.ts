/**
 * Test actual video fetching through the proxy system
 * Run: npx tsx scripts/test-video-fetch.ts
 */

import { PornHub } from 'pornhub.js'
import {
  getProxiesForRacing,
  reportProxySuccess,
  reportProxyFailure,
  getProxyStats,
} from '../src/lib/proxy'

const TEST_VIDEO_ID = '1000683313' // Known working video ID

async function testVideoFetch() {
  console.log('🎬 Testing Actual Video Fetch')
  console.log('=' .repeat(50))
  console.log(`Video ID: ${TEST_VIDEO_ID}`)
  console.log('')

  // Get 3 proxies for racing (same as stream route)
  const proxies = getProxiesForRacing(3)
  console.log(`📡 Got ${proxies.length} proxies for racing:`)
  proxies.forEach((p, i) => console.log(`   ${i + 1}. ${p.proxyUrl}`))
  console.log('')

  // Create racing promises
  console.log('🏎️  Racing proxies...')
  const startTime = Date.now()

  const racePromises = proxies.map(async (proxyInfo) => {
    const pornhub = new PornHub()
    pornhub.setAgent(proxyInfo.agent)

    const proxyStart = Date.now()
    try {
      const response = await pornhub.video(TEST_VIDEO_ID)
      const duration = Date.now() - proxyStart

      if (!response.mediaDefinitions || response.mediaDefinitions.length < 1) {
        console.log(`   ❌ ${proxyInfo.proxyUrl}: Empty media definitions (${duration}ms)`)
        throw new Error('No media definitions')
      }

      console.log(`   ✓ ${proxyInfo.proxyUrl}: Success (${duration}ms, ${response.mediaDefinitions.length} qualities)`)
      return { response, proxyId: proxyInfo.proxyId, proxyUrl: proxyInfo.proxyUrl, duration }
    } catch (error: unknown) {
      const duration = Date.now() - proxyStart
      console.log(`   ❌ ${proxyInfo.proxyUrl}: Failed (${duration}ms) - ${error instanceof Error ? error.message : error}`)
      const err = new Error(error instanceof Error ? error.message : 'Unknown error')
      ;(err as Error & { proxyId: string }).proxyId = proxyInfo.proxyId
      throw err
    }
  })

  // Race them
  try {
    const result = await Promise.any(racePromises)
    const totalDuration = Date.now() - startTime

    console.log('')
    console.log('✅ SUCCESS!')
    console.log(`   Winner: ${result.proxyUrl}`)
    console.log(`   Time: ${result.duration}ms (total race: ${totalDuration}ms)`)
    console.log('')

    // Report success
    reportProxySuccess(result.proxyId)

    // Show video details
    const video = result.response
    console.log('📺 Video Details:')
    console.log(`   Title: ${video.title?.substring(0, 50)}...`)
    console.log(`   Duration: ${video.duration}`)
    console.log(`   Views: ${video.views}`)
    console.log('')

    console.log('🎞️  Available Qualities:')
    video.mediaDefinitions.forEach((md) => {
      console.log(`   ${md.quality}p: ${md.videoUrl.substring(0, 60)}...`)
    })

    return true
  } catch (aggregateError) {
    const totalDuration = Date.now() - startTime
    console.log('')
    console.log(`❌ ALL PROXIES FAILED (${totalDuration}ms)`)

    // Report failures
    if (aggregateError instanceof AggregateError) {
      for (const err of aggregateError.errors) {
        const proxyId = (err as Error & { proxyId?: string }).proxyId
        if (proxyId) {
          reportProxyFailure(proxyId)
        }
      }
    }

    return false
  }
}

async function main() {
  const success = await testVideoFetch()

  console.log('')
  console.log('=' .repeat(50))
  console.log('📊 Proxy Health After Test:')
  const stats = getProxyStats()
  const withActivity = stats.proxies.filter(p => p.successes > 0 || p.failures > 0)
  withActivity.forEach(p => {
    const status = p.inCooldown ? '❄️ COOLDOWN' : '✓'
    console.log(`   ${p.hostPort}: ${p.successes}S/${p.failures}F (${p.successRate}%) ${status}`)
  })

  if (!success) {
    console.log('')
    console.log('⚠️  Video fetch failed - this could be:')
    console.log('   1. All proxies are blocked/rate-limited')
    console.log('   2. Network issues')
    console.log('   3. Video ID no longer exists')
    process.exit(1)
  }
}

main().catch(console.error)
