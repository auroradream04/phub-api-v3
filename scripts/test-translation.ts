#!/usr/bin/env tsx
/**
 * Script to test LibreTranslate API with 50 video titles
 *
 * Usage:
 *   npx tsx scripts/test-translation.ts
 */

import { translateBatchEfficient, isChinese } from '../src/lib/translate'

const testTitles = [
  // Batch 1
  'Hot Blonde Teen Fucked Hard',
  'Asian Sluts Nicole Doshi & Kazumi Got Alex Jones BBC All Wet',
  'Beautiful Asian Baby Learning During Study',
  'Tiny Asian Best Friend Tries Big White Cock',
  'Perfect Body Asian Roommate During Room Sharing',
  // Batch 2
  'Pinay Student Getting Fucked by Classmates',
  'Passionate Couple Making Love in the Bedroom',
  'Professional Yoga Instructor Teaching Advanced Poses',
  'Coffee Shop Romance Late Night Conversation',
  'Adventure Travel Vlog Southeast Asia Backpacking',
  // Batch 3
  'Gorgeous Teen Takes Massive BBC Deep Throat',
  'Curvy Latina Loves That Creamy Filling',
  'Hot Milf Seduces Young Guy in the Kitchen',
  'College Girls First Time With Toys',
  'Busty Blonde Gets Double Penetrated',
  // Batch 4
  'Indian Housewife Homemade Bedroom Video',
  'Thai Girl Loves Hard Cock in Bar',
  'Japanese Uncensored Amateur Wife Video',
  'Korean Beauty Gets Filled at Night',
  'Filipino Maid Caught by Boss',
  // Batch 5
  'Ebony Beauty Shakes That Big Ass',
  'Redhead Gets Fucked Against the Wall',
  'Teen Sucks Huge Meat in Shower Scene',
  'Busty Webcam Girl Shows Everything',
  'Party Girl Gets Tag Teamed',
  // Batch 6
  'Homemade Video of Wife and Friend',
  'Cute Girl First Time Porn Shoot',
  'Muscular Guy Dominates Skinny Girl',
  'Anal Loving Slut Takes It All',
  'Orgy with Friends in the Apartment',
  // Batch 7
  'Petite Teen Gets Destroyed by Big Dick',
  'Mature Woman Loves Younger Cock',
  'Cheating Wife Fucks Stranger in Car',
  'Horny Couple Makes Love Outdoors',
  'Office Worker Fucks Boss for Promotion',
  // Batch 8
  'Beach Sex with Hot Stranger',
  'MILF Teaches Young Girl',
  'Stepsister Seduction in Bedroom',
  'Lesbian Friends Eating Each Other',
  'Black Girl Gets White Cock',
  // Batch 9
  'Hot Shower Sex with Girlfriend',
  'Wet Pussy Gets Filled Deep',
  'BBW Loves Taking It',
  'Teen Gets Orgasm from Pussy Licking',
  'Drunk Girl at Party Gets Used'
]

async function main() {
  console.log('[Test Translation] Testing LibreTranslate API with', testTitles.length, 'titles')
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
