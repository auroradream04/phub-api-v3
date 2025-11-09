import { PrismaClient } from '../src/generated/prisma/index.js'

const prisma = new PrismaClient()

async function populateDirectors() {
  try {
    console.log('[Script] Starting director population...')

    // Find all videos with empty/null directors
    const videosWithoutDirector = await prisma.video.findMany({
      where: {
        OR: [
          { vodDirector: '' },
          { vodDirector: null },
        ],
      },
      select: {
        id: true,
        vodId: true,
        vodName: true,
        vodActor: true,
        vodDirector: true,
      },
    })

    console.log(`[Script] Found ${videosWithoutDirector.length} videos with empty directors`)

    if (videosWithoutDirector.length === 0) {
      console.log('[Script] No videos to update')
      return
    }

    // Group by actor to avoid duplicates in logging
    const actorGroups = new Map<string, number>()
    const updates: Array<{ id: string; vodId: string; newDirector: string }> = []

    for (const video of videosWithoutDirector) {
      const actor = video.vodActor || 'Unknown'

      // Only update if actor is not empty
      if (actor && actor.trim() !== '') {
        updates.push({
          id: video.id,
          vodId: video.vodId,
          newDirector: actor,
        })

        const count = actorGroups.get(actor) || 0
        actorGroups.set(actor, count + 1)
      }
    }

    console.log('[Script] Videos by actor:')
    for (const [actor, count] of actorGroups) {
      console.log(`  - ${actor}: ${count} videos`)
    }

    // Perform batch update
    console.log(`[Script] Updating ${updates.length} videos...`)

    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < updates.length; i++) {
      const { id, vodId, newDirector } = updates[i]
      try {
        await prisma.video.update({
          where: { id },
          data: { vodDirector: newDirector },
        })
        successCount++

        if ((i + 1) % 100 === 0) {
          console.log(`[Script] Progress: ${i + 1}/${updates.length}`)
        }
      } catch (error) {
        console.error(`[Script] Failed to update video ${vodId}:`, error)
        errorCount++
      }
    }

    console.log(`[Script] ✅ Update complete!`)
    console.log(`[Script] Success: ${successCount}`)
    console.log(`[Script] Errors: ${errorCount}`)

    // Verify the update
    const stillEmpty = await prisma.video.count({
      where: {
        OR: [
          { vodDirector: '' },
          { vodDirector: null },
        ],
      },
    })

    console.log(`[Script] Videos still with empty directors: ${stillEmpty}`)

  } catch (error) {
    console.error('[Script] Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

populateDirectors()
