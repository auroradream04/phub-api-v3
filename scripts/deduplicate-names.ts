import { PrismaClient } from '../src/generated/prisma/index.js'

const prisma = new PrismaClient({
  errorFormat: 'pretty',
})

async function deduplicateNames() {
  console.log('Starting name deduplication...\n')

  try {
    const videos = await prisma.video.findMany({
      select: {
        id: true,
        vodId: true,
        vodName: true,
      },
      orderBy: [
        { vodName: 'asc' },
        { vodTime: 'asc' }, // Order by oldest first to keep first as primary
      ],
    })

    // Group by vodName
    const nameGroups = new Map<string, typeof videos>()
    for (const video of videos) {
      if (!nameGroups.has(video.vodName)) {
        nameGroups.set(video.vodName, [])
      }
      nameGroups.get(video.vodName)!.push(video)
    }

    // Find duplicates and prepare updates
    const updates: Array<{ id: string; newName: string }> = []
    let totalDuplicates = 0

    for (const [name, group] of nameGroups) {
      if (group.length > 1) {
        totalDuplicates += group.length - 1
        // Keep first one unchanged, add (2), (3), etc. to the rest
        for (let i = 1; i < group.length; i++) {
          const newName = `${name} (${i + 1})`
          updates.push({
            id: group[i]!.id,
            newName,
          })
        }
      }
    }

    console.log(`Found ${nameGroups.size} unique names`)
    console.log(`Found ${updates.length} videos to rename\n`)

    // Apply updates
    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i]!
      try {
        await prisma.video.update({
          where: { id: update.id },
          data: { vodName: update.newName },
        })
        successCount++

        if ((i + 1) % 100 === 0) {
          console.log(`  Progress: ${i + 1}/${updates.length} updated`)
        }
      } catch (err) {
        console.error(`Failed to update video ${update.id}:`, err)
        errorCount++
      }
    }

    console.log(`\n✅ Deduplication complete!`)
    console.log(`  Videos renamed: ${successCount}`)
    console.log(`  Errors: ${errorCount}`)
  } catch (err) {
    console.error('Fatal error:', err)
  } finally {
    await prisma.$disconnect()
  }
}

deduplicateNames().catch(console.error)
