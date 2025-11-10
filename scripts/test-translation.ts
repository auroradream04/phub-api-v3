#!/usr/bin/env tsx
/**
 * Script to test Google Translate API with various English titles
 *
 * Usage:
 *   npx tsx scripts/test-translation.ts
 */

import { translateBatchEfficient, isChinese } from '../src/lib/translate'

const testTitles = [
  'Hot Blonde Teen Fucked Hard',
  'Asian Sluts Nicole Doshi & Kazumi Got Alex Jones BBC All Wet',
  'Beautiful Asian Baby Learning During Study - Nicole Doshi',
  'Tiny Asian Best Friend Tries Big White Cock',
  'Perfect Body Asian Roommate During Room Sharing',
  'Pinay Student Getting Fucked by Classmates',
  'Passionate Couple Making Love in the Bedroom',
  'Professional Yoga Instructor Teaching Advanced Poses',
  'Coffee Shop Romance Late Night Conversation',
  'Adventure Travel Vlog Southeast Asia Backpacking'
]

async function main() {
  console.log('[Test Translation] Testing Google Translate API with', testTitles.length, 'titles')
  console.log('═'.repeat(80))

  try {
    // Translate all titles in one batch
    const results = await translateBatchEfficient(testTitles)

    console.log('\n[Results]')
    console.log('═'.repeat(80))

    let successCount = 0
    let chineseCount = 0

    for (let i = 0; i < testTitles.length; i++) {
      const original = testTitles[i]
      const result = results[i]

      const isChineseText = isChinese(result.text)
      const status = result.success ? '✓' : '✗'
      const chineseStatus = isChineseText ? '🇨🇳' : '🇬🇧'

      console.log(`\n[${i + 1}] ${status} ${chineseStatus}`)
      console.log(`  Original:  "${original}"`)
      console.log(`  Translated: "${result.text}"`)
      console.log(`  Success: ${result.success} | IsChinese: ${isChineseText}`)

      if (result.success) successCount++
      if (isChineseText) chineseCount++
    }

    console.log('\n' + '═'.repeat(80))
    console.log('[Summary]')
    console.log(`  Total: ${testTitles.length}`)
    console.log(`  Successful: ${successCount}`)
    console.log(`  Actually Chinese: ${chineseCount}`)
    console.log(`  Success Rate: ${((successCount / testTitles.length) * 100).toFixed(1)}%`)
    console.log(`  Chinese Rate: ${((chineseCount / testTitles.length) * 100).toFixed(1)}%`)

    if (chineseCount === testTitles.length) {
      console.log('\n✓ ALL TESTS PASSED - All titles translated to Chinese!')
    } else {
      console.log(`\n⚠ WARNING - Only ${chineseCount}/${testTitles.length} titles are in Chinese`)
    }

  } catch (error) {
    console.error('[Test Translation] Error:', error)
    process.exit(1)
  }

  process.exit(0)
}

main()
