#!/usr/bin/env tsx
/**
 * Script to test LibreTranslate API with 50 video titles
 *
 * Usage:
 *   npx tsx scripts/test-translation.ts
 */

import { translateBatchEfficient, isChinese } from '../src/lib/translate'

const testTitles = [
  'Hot Blonde Teen Fucked Hard',
  'Asian Sluts Nicole Doshi & Kazumi Got Alex Jones BBC All Wet',
  'Beautiful Asian Baby Learning During Study',
  'Tiny Asian Best Friend Tries Big White Cock',
  'Perfect Body Asian Roommate During Room Sharing',
  'Pinay Student Getting Fucked by Classmates',
  'Passionate Couple Making Love in the Bedroom',
  'Professional Yoga Instructor Teaching Advanced Poses',
  'Coffee Shop Romance Late Night Conversation',
  'Adventure Travel Vlog Southeast Asia Backpacking',
  'Gorgeous Teen Takes Massive BBC Deep Throat',
  'Curvy Latina Loves That Creamy Filling',
  'Hot Milf Seduces Young Guy in the Kitchen',
  'College Girls First Time With Toys',
  'Busty Blonde Gets Double Penetrated',
  'Indian Housewife Homemade Bedroom Video',
  'Thai Girl Loves Hard Cock in Bar',
  'Japanese Uncensored Amateur Wife Video',
  'Korean Beauty Gets Filled at Night',
  'Filipino Maid Caught by Boss',
  'Ebony Beauty Shakes That Big Ass',
  'Redhead Gets Fucked Against the Wall',
  'Teen Sucks Huge Meat in Shower Scene',
  'Busty Webcam Girl Shows Everything',
  'Party Girl Gets Tag Teamed',
  'Homemade Video of Wife and Friend',
  'Cute Girl First Time Porn Shoot',
  'Muscular Guy Dominates Skinny Girl',
  'Anal Loving Slut Takes It All',
  'Orgy with Friends in the Apartment',
  'Petite Teen Gets Destroyed by Big Dick',
  'Mature Woman Loves Younger Cock',
  'Cheating Wife Fucks Stranger in Car',
  'Horny Couple Makes Love Outdoors',
  'Office Worker Fucks Boss for Promotion',
  'Beach Sex with Hot Stranger',
  'MILF Teaches Young Girl',
  'Stepsister Seduction in Bedroom',
  'Lesbian Friends Eating Each Other',
  'Black Girl Gets White Cock',
  'Hot Shower Sex with Girlfriend',
  'Wet Pussy Gets Filled Deep',
  'BBW Loves Taking It',
  'Teen Gets Orgasm from Pussy Licking',
  'Drunk Girl at Party Gets Used',
  'Shy Girl First Porn Video Ever',
  'Big Ass Gets Spanked Hard',
  'Creampie Surprise for Tiny Girl',
  'Married Woman Affair in Hotel',
  'Maid Gets Caught with Guests',
  'Doctor Takes Advantage of Patient',
  'Teacher Seduces Student After Class',
  'Boss Fucks Secretary in Office',
  'Blind Date Turns into Sex',
  'First Time Anal for Young Teen',
  'Huge Cock Destroys Tiny Pussy',
  'Orgasm Compilation Best Moments',
  'Homemade Amateur Couple Video',
  'Threesome with Best Friends',
  'Solo Girl Plays with Herself',
  'Couples Swap Partners for Night',
  'Party Games Turn into Orgy',
  'Casting Couch Hidden Camera',
  'Public Sex in Busy Street',
  'Bathroom Quickie During Work',
  'Beach Day Gets Naughty Fast',
  'Neighbor Boy Fucks Hot Milf',
  'Delivery Man Seduces Housewife',
  'Plumber Gets Lucky Today',
  'Gym Instructor Fucks Client',
  'Pizza Delivery Gets Extra Tip',
  'Locksmith Finds More Than Lock',
  'Uber Driver Picks Up Horny Girl',
  'Taxi Ride Becomes Sexual',
  'Hotel Maid Joins the Party',
  'Stewardess Joins the Club',
  'Nurse Gets Dirty with Patient',
  'Police Officer Gets Bribe',
  'Soldier Home on Leave Gets Action',
  'Coach Abuses His Power',
  'Principal Fucks Student',
  'Priest Breaks His Vow',
  'Judge Takes Bribe in Bed',
  'Lawyer Seduces Client',
  'Doctor Patient Relationship',
  'Therapist Breaks Rules',
  'Photographer Uses Position',
  'Director Casts for Couch',
  'Producer Gets What He Wants',
  'Manager Wants More From Employee',
  'Professor Grades With Sex',
  'Coach Trains With Benefits',
  'Trainer Gets Personal',
  'Mentor Mentors Young Girl',
  'Boss Abuses Authority',
  'Secretary Pays with Body',
  'Intern Learns Hands On',
  'Rookie Gets Initiated'
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
