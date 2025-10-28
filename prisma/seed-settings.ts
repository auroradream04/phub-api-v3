import { PrismaClient } from '../src/generated/prisma'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding site settings...')

  // CORS Proxy URL
  await prisma.siteSetting.upsert({
    where: { key: 'cors_proxy_url' },
    update: {},
    create: {
      key: 'cors_proxy_url',
      value: 'https://cors.freechatnow.net/',
    },
  })
  console.log('✓ cors_proxy_url set to: https://cors.freechatnow.net/')

  // CORS Proxy Enabled
  await prisma.siteSetting.upsert({
    where: { key: 'cors_proxy_enabled' },
    update: {},
    create: {
      key: 'cors_proxy_enabled',
      value: 'true',
    },
  })
  console.log('✓ cors_proxy_enabled set to: true')

  // Segments to Skip (for ad injection)
  await prisma.siteSetting.upsert({
    where: { key: 'segments_to_skip' },
    update: {},
    create: {
      key: 'segments_to_skip',
      value: '2',
    },
  })
  console.log('✓ segments_to_skip set to: 2')

  // Auto Translate Titles
  await prisma.siteSetting.upsert({
    where: { key: 'auto_translate_titles' },
    update: {},
    create: {
      key: 'auto_translate_titles',
      value: 'false',
    },
  })
  console.log('✓ auto_translate_titles set to: false')

  console.log('Site settings seeded successfully!')
}

main()
  .catch((e) => {
    console.error('Error seeding settings:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })