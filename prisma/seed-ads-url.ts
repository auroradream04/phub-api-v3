import { PrismaClient } from '../src/generated/prisma'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding ads script URL...')

  await prisma.siteSetting.upsert({
    where: { key: 'ads_script_url' },
    update: { value: 'https://hcdream.com/berlin/ads/scripts/heiliao.js' },
    create: {
      key: 'ads_script_url',
      value: 'https://hcdream.com/berlin/ads/scripts/heiliao.js',
    },
  })
  console.log('✓ ads_script_url set')

  console.log('Ads script URL seeded successfully!')
}

main()
  .catch((e) => {
    console.error('Error seeding ads URL:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })