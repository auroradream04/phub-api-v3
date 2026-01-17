/**
 * Stream API Benchmark Script
 * Compares legacy vs optimized stream endpoints
 *
 * Usage: npx tsx scripts/benchmark-stream.ts
 */

const BENCHMARK_BASE_URL = process.env.BASE_URL || 'https://md8av.com'

// Test video IDs (from database)
const VIDEO_IDS = [
  '02744feeea9351291360',
  '1000683313',
  '1000808757',
]

const RUNS_PER_VIDEO = 5

interface TimingResult {
  videoId: string
  endpoint: 'legacy' | 'optimized'
  run: number
  duration: number
  status: number
  cached?: boolean
}

async function measureRequest(
  videoId: string,
  endpoint: 'legacy' | 'optimized',
  run: number
): Promise<TimingResult> {
  const path = endpoint === 'legacy' ? 'stream-legacy' : 'stream'
  const url = `${BENCHMARK_BASE_URL}/api/watch/${videoId}/${path}.m3u8?q=720`

  const start = performance.now()
  try {
    const response = await fetch(url)
    const duration = performance.now() - start

    // Check if response indicates cache hit (look at response time)
    const cached = duration < 100

    return {
      videoId,
      endpoint,
      run,
      duration: Math.round(duration),
      status: response.status,
      cached,
    }
  } catch (error) {
    const duration = performance.now() - start
    return {
      videoId,
      endpoint,
      run,
      duration: Math.round(duration),
      status: 0,
    }
  }
}

async function runBenchmark() {
  console.log('🚀 Stream API Benchmark')
  console.log('========================')
  console.log(`Base URL: ${BENCHMARK_BASE_URL}`)
  console.log(`Videos: ${VIDEO_IDS.length}`)
  console.log(`Runs per video: ${RUNS_PER_VIDEO}`)
  console.log('')

  const legacyResults: TimingResult[] = []
  const optimizedResults: TimingResult[] = []

  // Test Legacy endpoint
  console.log('📦 Testing LEGACY endpoint...')
  console.log('─'.repeat(50))

  for (const videoId of VIDEO_IDS) {
    console.log(`\n  Video: ${videoId}`)
    for (let run = 1; run <= RUNS_PER_VIDEO; run++) {
      const result = await measureRequest(videoId, 'legacy', run)
      legacyResults.push(result)
      const status = result.status === 200 ? '✓' : '✗'
      console.log(`    Run ${run}: ${result.duration}ms ${status}`)

      // Small delay between requests
      await new Promise(r => setTimeout(r, 500))
    }
  }

  // Clear any server-side caches by waiting
  console.log('\n⏳ Waiting 2s before testing optimized endpoint...\n')
  await new Promise(r => setTimeout(r, 2000))

  // Test Optimized endpoint
  console.log('⚡ Testing OPTIMIZED endpoint...')
  console.log('─'.repeat(50))

  for (const videoId of VIDEO_IDS) {
    console.log(`\n  Video: ${videoId}`)
    for (let run = 1; run <= RUNS_PER_VIDEO; run++) {
      const result = await measureRequest(videoId, 'optimized', run)
      optimizedResults.push(result)
      const status = result.status === 200 ? '✓' : '✗'
      const cacheHit = result.cached ? ' (cache hit!)' : ''
      console.log(`    Run ${run}: ${result.duration}ms ${status}${cacheHit}`)

      // Small delay between requests
      await new Promise(r => setTimeout(r, 500))
    }
  }

  // Calculate statistics
  console.log('\n')
  console.log('📊 RESULTS')
  console.log('═'.repeat(60))

  const legacyTimes = legacyResults.filter(r => r.status === 200).map(r => r.duration)
  const optimizedTimes = optimizedResults.filter(r => r.status === 200).map(r => r.duration)

  const legacyAvg = legacyTimes.length > 0
    ? Math.round(legacyTimes.reduce((a, b) => a + b, 0) / legacyTimes.length)
    : 0
  const optimizedAvg = optimizedTimes.length > 0
    ? Math.round(optimizedTimes.reduce((a, b) => a + b, 0) / optimizedTimes.length)
    : 0

  const legacyMin = legacyTimes.length > 0 ? Math.min(...legacyTimes) : 0
  const legacyMax = legacyTimes.length > 0 ? Math.max(...legacyTimes) : 0
  const optimizedMin = optimizedTimes.length > 0 ? Math.min(...optimizedTimes) : 0
  const optimizedMax = optimizedTimes.length > 0 ? Math.max(...optimizedTimes) : 0

  // First run (cold cache) vs subsequent runs (warm cache)
  const optimizedFirstRuns = optimizedResults.filter(r => r.run === 1 && r.status === 200).map(r => r.duration)
  const optimizedSubsequent = optimizedResults.filter(r => r.run > 1 && r.status === 200).map(r => r.duration)

  const optimizedFirstAvg = optimizedFirstRuns.length > 0
    ? Math.round(optimizedFirstRuns.reduce((a, b) => a + b, 0) / optimizedFirstRuns.length)
    : 0
  const optimizedSubsequentAvg = optimizedSubsequent.length > 0
    ? Math.round(optimizedSubsequent.reduce((a, b) => a + b, 0) / optimizedSubsequent.length)
    : 0

  console.log('')
  console.log('┌─────────────────────┬──────────────┬──────────────┐')
  console.log('│ Metric              │ Legacy       │ Optimized    │')
  console.log('├─────────────────────┼──────────────┼──────────────┤')
  console.log(`│ Average             │ ${String(legacyAvg + 'ms').padEnd(12)} │ ${String(optimizedAvg + 'ms').padEnd(12)} │`)
  console.log(`│ Min                 │ ${String(legacyMin + 'ms').padEnd(12)} │ ${String(optimizedMin + 'ms').padEnd(12)} │`)
  console.log(`│ Max                 │ ${String(legacyMax + 'ms').padEnd(12)} │ ${String(optimizedMax + 'ms').padEnd(12)} │`)
  console.log(`│ Success Rate        │ ${String((legacyTimes.length / legacyResults.length * 100).toFixed(0) + '%').padEnd(12)} │ ${String((optimizedTimes.length / optimizedResults.length * 100).toFixed(0) + '%').padEnd(12)} │`)
  console.log('└─────────────────────┴──────────────┴──────────────┘')

  console.log('')
  console.log('⚡ Optimized Endpoint Cache Analysis:')
  console.log(`   First request (cold):  ${optimizedFirstAvg}ms avg`)
  console.log(`   Subsequent (cached):   ${optimizedSubsequentAvg}ms avg`)

  if (legacyAvg > 0 && optimizedAvg > 0) {
    const improvement = ((legacyAvg - optimizedAvg) / legacyAvg * 100).toFixed(1)
    const speedup = (legacyAvg / optimizedAvg).toFixed(1)
    console.log('')
    console.log(`🎯 Overall: ${improvement}% faster (${speedup}x speedup)`)
  }

  if (legacyAvg > 0 && optimizedSubsequentAvg > 0) {
    const cacheSpeedup = (legacyAvg / optimizedSubsequentAvg).toFixed(1)
    console.log(`🚀 With cache: ${cacheSpeedup}x faster than legacy`)
  }

  console.log('')
}

runBenchmark().catch(console.error)
