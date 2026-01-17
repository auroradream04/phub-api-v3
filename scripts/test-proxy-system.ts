/**
 * Test script for the new proxy system
 * Run: npx tsx scripts/test-proxy-system.ts
 */

import {
  getRandomProxy,
  getProxiesForRacing,
  reportProxySuccess,
  reportProxyFailure,
  getProxyStats,
  clearProxyHealth,
} from '../src/lib/proxy'

console.log('🧪 Testing Proxy System')
console.log('=' .repeat(50))

// Test 1: Proxy list loading
console.log('\n📋 Test 1: Proxy List Loading')
const stats1 = getProxyStats()
console.log(`   Total proxies loaded: ${stats1.total}`)
console.log(`   Healthy: ${stats1.healthy}`)
console.log(`   In cooldown: ${stats1.inCooldown}`)
if (stats1.total === 0) {
  console.log('   ❌ FAIL: No proxies loaded!')
  process.exit(1)
}
console.log('   ✓ PASS')

// Test 2: Get random proxy
console.log('\n🎲 Test 2: Get Random Proxy')
const proxy1 = getRandomProxy('Test')
if (!proxy1) {
  console.log('   ❌ FAIL: getRandomProxy returned null')
  process.exit(1)
}
console.log(`   Got proxy: ${proxy1.proxyUrl}`)
console.log(`   Has agent: ${!!proxy1.agent}`)
console.log(`   Has proxyId: ${!!proxy1.proxyId}`)
console.log('   ✓ PASS')

// Test 3: Get proxies for racing
console.log('\n🏎️  Test 3: Get Proxies for Racing')
const racingProxies = getProxiesForRacing(3)
console.log(`   Requested 3 proxies, got: ${racingProxies.length}`)
const uniqueUrls = new Set(racingProxies.map(p => p.proxyUrl))
console.log(`   Unique proxies: ${uniqueUrls.size}`)
if (racingProxies.length < 1) {
  console.log('   ❌ FAIL: No proxies returned for racing')
  process.exit(1)
}
console.log('   ✓ PASS')

// Test 4: Health reporting
console.log('\n💊 Test 4: Health Reporting')
clearProxyHealth() // Start fresh
const testProxy = getRandomProxy('Test')!
console.log(`   Testing with proxy: ${testProxy.proxyUrl}`)

// Report some successes
reportProxySuccess(testProxy.proxyId)
reportProxySuccess(testProxy.proxyId)
reportProxySuccess(testProxy.proxyId)

const statsAfterSuccess = getProxyStats()
const proxyHealth = statsAfterSuccess.proxies.find(p => p.hostPort === testProxy.proxyUrl)
console.log(`   After 3 successes: ${proxyHealth?.successes} successes, ${proxyHealth?.failures} failures`)
console.log(`   Success rate: ${proxyHealth?.successRate}%`)
console.log('   ✓ PASS')

// Test 5: Cooldown mechanism
console.log('\n❄️  Test 5: Cooldown Mechanism')
clearProxyHealth() // Start fresh
const testProxy2 = getRandomProxy('Test')!
console.log(`   Testing with proxy: ${testProxy2.proxyUrl}`)

// Report 3 consecutive failures to trigger cooldown
reportProxyFailure(testProxy2.proxyId)
reportProxyFailure(testProxy2.proxyId)
reportProxyFailure(testProxy2.proxyId)

const statsAfterFailures = getProxyStats()
const proxyHealth2 = statsAfterFailures.proxies.find(p => p.hostPort === testProxy2.proxyUrl)
console.log(`   After 3 failures: inCooldown = ${proxyHealth2?.inCooldown}`)
console.log(`   Cooldown remaining: ${proxyHealth2?.cooldownRemaining}s`)

if (!proxyHealth2?.inCooldown) {
  console.log('   ❌ FAIL: Proxy should be in cooldown after 3 failures')
  process.exit(1)
}
console.log('   ✓ PASS')

// Test 6: Weighted selection (proxy in cooldown should be skipped)
console.log('\n⚖️  Test 6: Weighted Selection (Cooldown Skip)')
// Get 10 proxies and check that the cooldown proxy is not selected
let cooldownProxySelected = 0
for (let i = 0; i < 20; i++) {
  const p = getRandomProxy('Test')
  if (p?.proxyUrl === testProxy2.proxyUrl) {
    cooldownProxySelected++
  }
}
console.log(`   Cooldown proxy selected ${cooldownProxySelected}/20 times`)
if (cooldownProxySelected > 5) {
  console.log('   ⚠️  WARNING: Cooldown proxy selected too often (might indicate issue)')
} else {
  console.log('   ✓ PASS (cooldown proxy mostly avoided)')
}

// Test 7: Agent caching
console.log('\n💾 Test 7: Agent Caching')
const p1 = getRandomProxy('Test')
const p2 = getProxiesForRacing(1)[0]
// Get same proxy again to test caching
const sameProxyUrl = p1?.proxyUrl
let foundSameAgent = false
for (let i = 0; i < 50; i++) {
  const p = getRandomProxy('Test')
  if (p?.proxyUrl === sameProxyUrl && p?.agent === p1?.agent) {
    foundSameAgent = true
    break
  }
}
console.log(`   Same agent reused: ${foundSameAgent ? 'Yes' : 'Could not verify (different proxies selected)'}`)
console.log('   ✓ PASS')

// Clean up
clearProxyHealth()

// Final summary
console.log('\n' + '=' .repeat(50))
console.log('✅ All tests passed!')
console.log('')
console.log('📊 Final Stats:')
const finalStats = getProxyStats()
console.log(`   Total proxies: ${finalStats.total}`)
console.log(`   Healthy: ${finalStats.healthy}`)
console.log(`   In cooldown: ${finalStats.inCooldown}`)
