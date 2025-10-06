import { PrismaClient } from '../src/generated/prisma'

const prisma = new PrismaClient()

// Category mapping
const categories = [
  { id: 1, name: 'Amateur' },
  { id: 2, name: 'Anal' },
  { id: 3, name: 'Asian' },
  { id: 4, name: 'BBW' },
  { id: 5, name: 'Big Ass' },
  { id: 6, name: 'Big Tits' },
  { id: 7, name: 'Blonde' },
  { id: 8, name: 'Blowjob' },
  { id: 9, name: 'Brunette' },
  { id: 10, name: 'Creampie' },
  { id: 11, name: 'Cumshot' },
  { id: 12, name: 'Ebony' },
  { id: 13, name: 'Hardcore' },
  { id: 14, name: 'Hentai' },
  { id: 15, name: 'Latina' },
  { id: 16, name: 'Lesbian' },
  { id: 17, name: 'MILF' },
  { id: 18, name: 'POV' },
  { id: 19, name: 'Teen' },
  { id: 20, name: 'Threesome' },
]

// Generate sample video titles
const sampleTitles = [
  'Hot {category} Action',
  'Best {category} Compilation',
  'Amazing {category} Video',
  'Top {category} Scenes',
  'Ultimate {category} Experience',
  'Incredible {category} Moments',
  'Perfect {category} Collection',
  'Premium {category} Content',
  'Exclusive {category} Footage',
  'Sexy {category} Performance',
]

const sampleActors = [
  'Riley Reid', 'Mia Khalifa', 'Lisa Ann', 'Asa Akira', 'Angela White',
  'Lana Rhoades', 'Mia Malkova', 'Adriana Chechik', 'Alexis Texas', 'Brandi Love'
]

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function generateVideos(count: number) {
  const videos = []
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:4444'

  for (let i = 0; i < count; i++) {
    const category = getRandomItem(categories)
    const titleTemplate = getRandomItem(sampleTitles)
    const title = titleTemplate.replace('{category}', category.name)
    const vodId = `ph${Date.now()}${Math.random().toString(36).substring(2, 9)}`
    const duration = Math.floor(Math.random() * 1800) + 300 // 5-35 minutes
    const views = Math.floor(Math.random() * 100000)
    const year = 2020 + Math.floor(Math.random() * 5)

    videos.push({
      vodId,
      vodName: title,
      typeId: category.id,
      typeName: category.name,
      vodEn: generateSlug(title),
      vodTime: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000), // Random date in last year
      vodRemarks: `HD ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
      vodPlayFrom: 'YourAPI',
      vodPic: `https://picsum.photos/seed/${vodId}/300/200`, // Random placeholder image
      vodArea: getRandomItem(['US', 'EU', 'JP', 'KR']),
      vodLang: 'en',
      vodYear: year.toString(),
      vodActor: Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () => getRandomItem(sampleActors)).join(','),
      vodDirector: '',
      vodContent: `${title} - ${category.name} video featuring amazing scenes and incredible action. Duration: ${Math.floor(duration / 60)} minutes.`,
      vodPlayUrl: `Full Video$${baseUrl}/api/watch/${vodId}/stream?q=720`,
      views,
      duration,
    })
  }

  return videos
}

async function main() {
  console.log('🌱 Seeding videos...')

  // Delete existing videos
  await prisma.video.deleteMany({})
  console.log('✓ Cleared existing videos')

  // Generate and insert videos (500 videos total, ~25 per category)
  const videos = generateVideos(500)

  console.log(`📹 Creating ${videos.length} videos...`)

  // Insert in batches to avoid timeout
  const batchSize = 100
  for (let i = 0; i < videos.length; i += batchSize) {
    const batch = videos.slice(i, i + batchSize)
    await prisma.video.createMany({
      data: batch,
    })
    console.log(`✓ Inserted ${Math.min(i + batchSize, videos.length)}/${videos.length} videos`)
  }

  // Print stats
  const stats = await prisma.video.groupBy({
    by: ['typeId', 'typeName'],
    _count: true,
  })

  console.log('\n📊 Video count by category:')
  stats.sort((a, b) => a.typeId - b.typeId).forEach((stat) => {
    console.log(`  ${stat.typeId}. ${stat.typeName}: ${stat._count} videos`)
  })

  console.log('\n✅ Seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
