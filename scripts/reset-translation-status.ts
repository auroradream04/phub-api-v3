#!/usr/bin/env tsx
/**
 * Script to reset needsTranslation status for videos
 *
 * Usage:
 *   npx tsx scripts/reset-translation-status.ts          // Reset all videos
 *   npx tsx scripts/reset-translation-status.ts all      // Reset all videos
 *   npx tsx scripts/reset-translation-status.ts failed   // Reset only failed videos (needsTranslation=true)
 *   npx tsx scripts/reset-translation-status.ts success  // Reset only successful videos (needsTranslation=false)
 */

import { PrismaClient } from '../src/generated/prisma'

const prisma = new PrismaClient()

async function main() {
  const mode = process.argv[2]?.toLowerCase() || 'all'

  console.log(`[Reset Translation Status] Mode: ${mode}`)

  let updateCount = 0

  if (mode === 'all') {
    console.log('Setting needsTranslation=true for ALL videos...')
    const result = await prisma.video.updateMany({
      data: {
        needsTranslation: true,
        translationRetryCount: 0,
        translationFailedAt: null,
      }
    })
    updateCount = result.count
    console.log(`✓ Updated ${updateCount} videos`)

  } else if (mode === 'failed') {
    console.log('Setting needsTranslation=true for failed videos (currently needsTranslation=true)...')
    const result = await prisma.video.updateMany({
      where: {
        needsTranslation: true,
      },
      data: {
        translationRetryCount: 0,
        translationFailedAt: null,
      }
    })
    updateCount = result.count
    console.log(`✓ Reset ${updateCount} failed videos`)

  } else if (mode === 'success') {
    console.log('Setting needsTranslation=true for successful videos (currently needsTranslation=false)...')
    const result = await prisma.video.updateMany({
      where: {
        needsTranslation: false,
      },
      data: {
        needsTranslation: true,
        translationRetryCount: 0,
        translationFailedAt: null,
      }
    })
    updateCount = result.count
    console.log(`✓ Reset ${updateCount} successful videos`)

  } else {
    console.error(`Unknown mode: ${mode}`)
    console.log(`Valid modes: all, failed, success`)
    process.exit(1)
  }

  // Show summary
  const stats = await prisma.video.groupBy({
    by: ['needsTranslation'],
    _count: true,
  })

  console.log('\nFinal stats:')
  for (const stat of stats) {
    const status = stat.needsTranslation ? 'Needs translation' : 'Translated'
    console.log(`  ${status}: ${stat._count} videos`)
  }

  const total = await prisma.video.count()
  console.log(`  Total: ${total} videos`)

  console.log('\n✓ Done!')
  process.exit(0)
}

main().catch((error) => {
  console.error('[Reset Translation Status] Error:', error)
  process.exit(1)
})
