#!/usr/bin/env tsx
/**
 * Script to reset vodName titles back to originalTitle AND reset translation status
 *
 * Usage:
 *   npx tsx scripts/reset-titles-and-translation.ts
 *
 * This will:
 * 1. Reset vodName back to originalTitle for all videos
 * 2. Set needsTranslation=true for all videos
 * 3. Reset translationRetryCount=0
 * 4. Reset translationFailedAt=null
 */

import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('[Reset Titles & Translation] Starting...')
  console.log('This will reset vodName back to originalTitle and mark all for re-translation')

  try {
    // Get count before
    const totalVideos = await prisma.video.count()
    console.log(`\nTotal videos to reset: ${totalVideos}`)

    // Update all videos
    console.log('\nResetting titles and translation status...')
    const result = await prisma.video.updateMany({
      data: {
        // Reset vodName to originalTitle (if originalTitle exists, otherwise keep vodName)
        // Note: We use a raw SQL approach for this conditional logic
        needsTranslation: true,
        translationRetryCount: 0,
        translationFailedAt: null,
      }
    })

    console.log(`✓ Updated ${result.count} videos`)

    // Now handle the title reset with raw SQL since Prisma doesn't support conditional updates well
    console.log('\nResetting vodName from originalTitle...')
    const sqlResult = await prisma.$executeRawUnsafe(`
      UPDATE video
      SET vodName = COALESCE(originalTitle, vodName)
      WHERE originalTitle IS NOT NULL
    `)
    console.log(`✓ Reset ${sqlResult} titles from originalTitle`)

    // Show final stats
    const stats = await prisma.video.groupBy({
      by: ['needsTranslation'],
      _count: true,
    })

    console.log('\nFinal stats:')
    for (const stat of stats) {
      const status = stat.needsTranslation ? 'Needs translation' : 'Already translated'
      console.log(`  ${status}: ${stat._count} videos`)
    }

    const total = await prisma.video.count()
    console.log(`  Total: ${total} videos`)

    console.log('\n✓ Reset complete! All titles and translation status reset.')
    process.exit(0)
  } catch (error) {
    console.error('[Reset] Error:', error)
    process.exit(1)
  }
}

main()
