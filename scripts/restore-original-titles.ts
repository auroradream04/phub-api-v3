#!/usr/bin/env tsx
/**
 * Script to restore videos to their original English titles
 *
 * Usage:
 *   npx tsx scripts/restore-original-titles.ts          // Restore all videos
 *   npx tsx scripts/restore-original-titles.ts dry-run  // Show what would be changed (doesn't actually update)
 */

import { PrismaClient } from '../src/generated/prisma'

const prisma = new PrismaClient()

async function main() {
  const dryRun = process.argv[2]?.toLowerCase() === 'dry-run'

  console.log(`[Restore Titles] Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE UPDATE'}`)

  // Find videos that have originalTitle set (meaning they were translated at some point)
  const videosWithOriginal = await prisma.video.findMany({
    where: {
      originalTitle: {
        not: null
      }
    },
    select: {
      id: true,
      vodId: true,
      vodName: true,
      originalTitle: true,
    }
  })

  console.log(`Found ${videosWithOriginal.length} videos with originalTitle set`)

  if (dryRun) {
    console.log('\n[DRY RUN] Would restore these videos:')
    for (const video of videosWithOriginal.slice(0, 10)) {
      console.log(`  ${video.vodId}:`)
      console.log(`    Current vodName: "${video.vodName}"`)
      console.log(`    Restore to: "${video.originalTitle}"`)
    }
    if (videosWithOriginal.length > 10) {
      console.log(`  ... and ${videosWithOriginal.length - 10} more`)
    }
    console.log(`\nTo apply these changes, run: npx tsx scripts/restore-original-titles.ts`)
    process.exit(0)
  }

  // Restore all videos
  let updatedCount = 0
  for (const video of videosWithOriginal) {
    try {
      if (!video.originalTitle) {
        console.warn(`⚠ Skipped ${video.vodId}: originalTitle is null`)
        continue
      }

      await prisma.video.update({
        where: { id: video.id },
        data: {
          vodName: video.originalTitle,
          needsTranslation: true,
          translationRetryCount: 0,
          translationFailedAt: null,
        }
      })
      updatedCount++
      console.log(`✓ Restored ${video.vodId}: "${video.originalTitle}"`)
    } catch (error) {
      console.error(`✗ Failed to restore ${video.vodId}:`, error instanceof Error ? error.message : error)
    }
  }

  // Show summary
  console.log(`\n[Restore Titles] Complete: ${updatedCount}/${videosWithOriginal.length} videos restored`)

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
  console.error('[Restore Titles] Error:', error)
  process.exit(1)
})
