import { prisma } from '../src/lib/prisma'

async function initScraperSettings() {
  try {
    console.log('Initializing scraper filter settings...\n')

    // Check if settings already exist
    const existingMinViews = await prisma.siteSetting.findUnique({
      where: { key: 'scraper_min_views' }
    })

    const existingMinDuration = await prisma.siteSetting.findUnique({
      where: { key: 'scraper_min_duration' }
    })

    // Create or update min_views setting
    if (existingMinViews) {
      console.log('✓ scraper_min_views already exists:', existingMinViews.value)
    } else {
      await prisma.siteSetting.create({
        data: {
          key: 'scraper_min_views',
          value: '0', // Default: no filter (0 = disabled)
        }
      })
      console.log('✓ Created scraper_min_views with default value: 0')
    }

    // Create or update min_duration setting
    if (existingMinDuration) {
      console.log('✓ scraper_min_duration already exists:', existingMinDuration.value)
    } else {
      await prisma.siteSetting.create({
        data: {
          key: 'scraper_min_duration',
          value: '0', // Default: no filter (0 = disabled)
        }
      })
      console.log('✓ Created scraper_min_duration with default value: 0')
    }

    console.log('\n✅ Scraper filter settings initialized successfully!')
    console.log('\nYou can now configure these in the admin panel at /admin/settings')
    console.log('- scraper_min_views: Set minimum view count (e.g., 10000)')
    console.log('- scraper_min_duration: Set minimum duration in seconds (e.g., 60)')

  } catch (error) {
    console.error('❌ Error initializing settings:', error)
  } finally {
    await prisma.$disconnect()
  }
}

initScraperSettings()
