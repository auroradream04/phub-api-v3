import { PrismaClient } from '../src/generated/prisma/index.js'

const prisma = new PrismaClient()

async function findEmojis() {
  // Search for the specific emoji hex pattern \xF0\x9F\x86\x93 (🆓 FREE emoji)
  const videos = await prisma.video.findMany({
    take: 100000,
  })

  let foundCount = 0
  const problemVideos: any[] = []

  for (const video of videos) {
    for (const [key, value] of Object.entries(video)) {
      if (typeof value === 'string' && value) {
        // Check for any UTF-8 byte sequence that looks like emoji (4-byte sequences)
        // or specific emoji patterns
        if (
          /[\xF0\xF1\xF2\xF3\xF4]/.test(value) ||
          /[🆓🎉🎬📺🔥💯✨🌟⭐]/.test(value) ||
          /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/u.test(value)
        ) {
          foundCount++
          const hex = Buffer.from(value.substring(0, 50)).toString('hex')
          problemVideos.push({
            vodId: video.vodId,
            field: key,
            value: value.substring(0, 100),
            hex: hex.substring(0, 60),
          })
          if (foundCount <= 10) {
            console.log(`\n[${foundCount}] Found in ${key}: "${value.substring(0, 80)}"`)
            console.log(`    Hex: ${hex.substring(0, 80)}`)
          }
        }
      }
    }
  }

  console.log(`\n\nTotal problematic values: ${foundCount}`)
  if (problemVideos.length > 0) {
    console.log('Sample:', JSON.stringify(problemVideos.slice(0, 3), null, 2))
  }

  await prisma.$disconnect()
}

findEmojis().catch(console.error)
