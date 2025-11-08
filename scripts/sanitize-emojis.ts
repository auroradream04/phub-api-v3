/**
 * Migration script to remove emojis from existing video records
 * Run with: npx ts-node scripts/sanitize-emojis.ts
 */

import { prisma } from '@/lib/prisma'

// Helper to strip emojis and special unicode characters
function stripEmojis(str: string | null | undefined): string {
  if (!str) return ''
  // Remove emojis and other problematic unicode characters
  return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/gu, '')
    .trim()
}

async function sanitizeEmojis() {
  console.log('Starting emoji sanitization...')

  try {
    // Get all videos
    const videos = await prisma.video.findMany({
      select: {
        id: true,
        vodId: true,
        vodName: true,
        vodContent: true,
        vodRemarks: true,
        vodActor: true,
      },
    })

    console.log(`Found ${videos.length} videos to check...`)

    let updatedCount = 0
    let totalCharsRemoved = 0

    for (const video of videos) {
      const cleanedName = stripEmojis(video.vodName)
      const cleanedContent = stripEmojis(video.vodContent)
      const cleanedRemarks = stripEmojis(video.vodRemarks)
      const cleanedActor = stripEmojis(video.vodActor)

      const nameChanged = cleanedName !== video.vodName
      const contentChanged = cleanedContent !== video.vodContent
      const remarksChanged = cleanedRemarks !== video.vodRemarks
      const actorChanged = cleanedActor !== video.vodActor

      if (nameChanged || contentChanged || remarksChanged || actorChanged) {
        const charsRemoved =
          (video.vodName?.length || 0) - cleanedName.length +
          (video.vodContent?.length || 0) - cleanedContent.length +
          (video.vodRemarks?.length || 0) - cleanedRemarks.length +
          (video.vodActor?.length || 0) - cleanedActor.length

        totalCharsRemoved += charsRemoved

        await prisma.video.update({
          where: { id: video.id },
          data: {
            vodName: nameChanged ? cleanedName : undefined,
            vodContent: contentChanged ? cleanedContent : undefined,
            vodRemarks: remarksChanged ? cleanedRemarks : undefined,
            vodActor: actorChanged ? cleanedActor : undefined,
          },
        })

        updatedCount++

        if (updatedCount % 100 === 0) {
          console.log(`  Progress: ${updatedCount}/${videos.length} videos updated`)
        }
      }
    }

    console.log(`\n✅ Sanitization complete!`)
    console.log(`  Videos updated: ${updatedCount}`)
    console.log(`  Total characters removed: ${totalCharsRemoved}`)

    if (updatedCount === 0) {
      console.log(`  No emojis found - database is already clean!`)
    }
  } catch (error) {
    console.error('❌ Error during sanitization:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

sanitizeEmojis()
