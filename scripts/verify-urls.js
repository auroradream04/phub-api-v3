// Verify that local database has localhost URLs
const { PrismaClient } = require('../src/generated/prisma')
const prisma = new PrismaClient()

async function verify() {
  console.log('🔍 Checking local database URLs...\n')

  const videos = await prisma.video.findMany({
    take: 5,
    select: {
      vodId: true,
      vodName: true,
      vodPlayUrl: true,
    }
  })

  let hasLocalhost = 0
  let hasProduction = 0

  videos.forEach(v => {
    if (v.vodPlayUrl.includes('localhost')) {
      hasLocalhost++
    }
    if (v.vodPlayUrl.includes('test.md8av.com')) {
      hasProduction++
    }
    console.log(`${v.vodId}: ${v.vodPlayUrl.substring(0, 60)}...`)
  })

  console.log(`\n📊 Results:`)
  console.log(`   Localhost URLs: ${hasLocalhost}`)
  console.log(`   Production URLs: ${hasProduction}`)

  if (hasLocalhost > 0 && hasProduction === 0) {
    console.log(`\n✅ Local database correctly uses localhost URLs!`)
  } else if (hasProduction > 0) {
    console.log(`\n⚠️  Warning: Found production URLs in local database!`)
  }

  await prisma.$disconnect()
}

verify().catch(console.error)
