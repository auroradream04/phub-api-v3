#!/usr/bin/env node

/**
 * Cleanup Script: Fix TypeId/TypeName Duplicates in Video Table
 *
 * This script identifies and fixes duplicate (typeId, typeName) pairs in production.
 * It's idempotent and safe to run multiple times.
 *
 * Usage:
 *   npm run ts-node -- src/scripts/cleanup-category-duplicates.ts [--dry-run] [--fix]
 *
 * Examples:
 *   # Preview what would be fixed (dry-run mode)
 *   npm run ts-node -- src/scripts/cleanup-category-duplicates.ts --dry-run
 *
 *   # Actually fix the data
 *   npm run ts-node -- src/scripts/cleanup-category-duplicates.ts --fix
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface CategoryStats {
  typeId: number
  expectedName: string
  mismatchedCount: number
  mismatchedNames: string[]
}

interface CleanupStats {
  totalVideos: number
  orphanedCount: number
  mismatchedCount: number
  fixedCount: number
  issues: CategoryStats[]
}

async function analyzeCategories(): Promise<CleanupStats> {
  console.log('📊 Analyzing category data...\n')

  const stats: CleanupStats = {
    totalVideos: 0,
    orphanedCount: 0,
    mismatchedCount: 0,
    fixedCount: 0,
    issues: [],
  }

  // Get all videos
  const videos = await prisma.video.findMany({
    select: {
      id: true,
      vodId: true,
      typeId: true,
      typeName: true,
    },
  })

  stats.totalVideos = videos.length
  console.log(`Total videos in database: ${stats.totalVideos}`)

  // Get all categories
  const categories = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
    },
  })

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]))
  console.log(`Total categories in database: ${categories.length}\n`)

  // Check for issues
  const issueMap = new Map<number, CategoryStats>()

  for (const video of videos) {
    const expectedName = categoryMap.get(video.typeId)

    // Issue 1: Orphaned typeId (no matching category)
    if (!expectedName) {
      stats.orphanedCount++
      console.log(
        `❌ ORPHANED: Video ${video.vodId} has typeId=${video.typeId} with no matching Category`
      )
      continue
    }

    // Issue 2: Mismatched typeName
    if (video.typeName !== expectedName) {
      stats.mismatchedCount++

      if (!issueMap.has(video.typeId)) {
        issueMap.set(video.typeId, {
          typeId: video.typeId,
          expectedName,
          mismatchedCount: 0,
          mismatchedNames: [],
        })
      }

      const issue = issueMap.get(video.typeId)!
      issue.mismatchedCount++
      if (!issue.mismatchedNames.includes(video.typeName)) {
        issue.mismatchedNames.push(video.typeName)
      }

      console.log(
        `⚠️  MISMATCH: Video ${video.vodId} has typeId=${video.typeId} ` +
          `but typeName="${video.typeName}" (expected "${expectedName}")`
      )
    }
  }

  stats.issues = Array.from(issueMap.values())

  // Summary
  console.log('\n' + '='.repeat(70))
  console.log('ISSUE SUMMARY')
  console.log('='.repeat(70))
  console.log(`Orphaned typeIds (no matching category): ${stats.orphanedCount}`)
  console.log(`Videos with mismatched typeName: ${stats.mismatchedCount}`)
  console.log(`Total issues: ${stats.orphanedCount + stats.mismatchedCount}\n`)

  if (stats.issues.length > 0) {
    console.log('Issues by Category:')
    for (const issue of stats.issues) {
      console.log(
        `  • TypeId ${issue.typeId} (${issue.expectedName}): ` +
          `${issue.mismatchedCount} videos with wrong names: ${issue.mismatchedNames.join(', ')}`
      )
    }
    console.log()
  }

  return stats
}

async function fixCategories(dryRun: boolean = true): Promise<CleanupStats> {
  const stats = await analyzeCategories()

  if (stats.orphanedCount === 0 && stats.mismatchedCount === 0) {
    console.log('✅ No issues found! Your data is clean.')
    return stats
  }

  const mode = dryRun ? 'DRY-RUN' : 'LIVE'
  console.log(`\n🔧 Running cleanup in ${mode} mode...\n`)

  // Fix 1: Orphaned typeIds
  if (stats.orphanedCount > 0) {
    console.log(`Fixing ${stats.orphanedCount} videos with orphaned typeIds...`)

    if (!dryRun) {
      const result = await prisma.video.updateMany({
        where: {
          typeId: {
            notIn: (
              await prisma.category.findMany({
                select: { id: true },
              })
            ).map((c) => c.id),
          },
        },
        data: {
          typeId: 1, // Default to Amateur
          typeName: 'Amateur',
        },
      })
      stats.fixedCount += result.count
      console.log(`  ✓ Fixed ${result.count} orphaned videos\n`)
    } else {
      console.log(`  [DRY-RUN] Would fix ${stats.orphanedCount} orphaned videos\n`)
    }
  }

  // Fix 2: Mismatched typeNames
  if (stats.mismatchedCount > 0) {
    console.log(`Fixing ${stats.mismatchedCount} videos with mismatched typeNames...`)

    for (const issue of stats.issues) {
      if (!dryRun) {
        const result = await prisma.video.updateMany({
          where: {
            typeId: issue.typeId,
            typeName: {
              not: issue.expectedName,
            },
          },
          data: {
            typeName: issue.expectedName,
          },
        })
        stats.fixedCount += result.count
        console.log(`  ✓ Fixed ${result.count} videos with typeId=${issue.typeId}`)
      } else {
        const count = await prisma.video.count({
          where: {
            typeId: issue.typeId,
            typeName: {
              not: issue.expectedName,
            },
          },
        })
        console.log(
          `  [DRY-RUN] Would fix ${count} videos with typeId=${issue.typeId}`
        )
      }
    }
    console.log()
  }

  // Verification
  console.log('🔍 Running verification...\n')

  const verifyIssues = await analyzeCategories()

  if (verifyIssues.orphanedCount === 0 && verifyIssues.mismatchedCount === 0) {
    console.log('✅ All issues fixed! Data is now consistent.\n')
  } else {
    console.log(
      '⚠️  Some issues remain. Run the script again or check for constraints.\n'
    )
  }

  return stats
}

async function verifyForeignKeyConstraint(): Promise<boolean> {
  console.log('🔗 Checking foreign key constraint...\n')

  try {
    const result = await prisma.$queryRaw<
      Array<{ CONSTRAINT_NAME: string }>
    >`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_NAME = 'Video'
      AND COLUMN_NAME = 'typeId'
      AND REFERENCED_TABLE_NAME IS NOT NULL
    `

    if (result && result.length > 0) {
      console.log(
        `✅ Foreign key constraint exists: ${result[0].CONSTRAINT_NAME}`
      )
      return true
    } else {
      console.log(
        '⚠️  Foreign key constraint NOT found. Run migration first:\n' +
          '   npm run migrate'
      )
      return false
    }
  } catch (error) {
    console.log('⚠️  Could not verify constraint:', error)
    return false
  }
}

async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const shouldFix = args.includes('--fix')

  console.log('🚀 Category Duplicate Cleanup Script\n')

  // Always run analysis first
  if (!shouldFix) {
    // Analysis only (default)
    console.log(
      '📋 Running in ANALYSIS mode. Use --fix to apply changes.\n'
    )
    await analyzeCategories()
    console.log(
      '\n💡 To fix these issues, run:\n  npm run ts-node -- src/scripts/cleanup-category-duplicates.ts --fix\n'
    )
  } else {
    // Run the fix
    const stats = await fixCategories(isDryRun)

    if (!isDryRun) {
      console.log('📊 Cleanup Statistics:')
      console.log(`  • Orphaned videos fixed: ${stats.orphanedCount}`)
      console.log(`  • Mismatched videos fixed: ${stats.mismatchedCount}`)
      console.log(`  • Total fixed: ${stats.fixedCount}\n`)

      // Verify the constraint exists
      await verifyForeignKeyConstraint()

      console.log(
        '\n✅ Cleanup complete! Your video categories are now consistent.'
      )
    }
  }

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})
