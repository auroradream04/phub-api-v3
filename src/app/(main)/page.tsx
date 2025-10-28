import HorizontalAds from '@/components/HorizontalAds'
import HomeClient from './home-client'

interface Category {
  name: string
}

async function getInitialData() {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  try {
    const [videosRes, categoriesRes] = await Promise.all([
      fetch(`${baseUrl}/api/db/home?page=1`, { cache: 'no-store' }),
      fetch(`${baseUrl}/api/db/categories`, { cache: 'no-store' })
    ])

    const videosData = await videosRes.json()
    const categoriesData = await categoriesRes.json()

    console.log('[Homepage Server] Categories response:', categoriesData)
    console.log('[Homepage Server] Categories count:', categoriesData.categories?.length)

    const categoryNames = categoriesData.categories?.map((cat: Category) => cat.name) || []
    console.log('[Homepage Server] Category names:', categoryNames)

    return {
      videos: videosData.data || [],
      stats: videosData.stats || { totalVideos: 0, todayUpdates: 0 },
      categories: categoryNames
    }
  } catch (error) {
    console.error('[Homepage Server] Failed to fetch initial data:', error)
    return {
      videos: [],
      stats: { totalVideos: 0, todayUpdates: 0 },
      categories: []
    }
  }
}

export default async function Home() {
  const { videos, stats, categories } = await getInitialData()

  return (
    <div className="min-h-screen bg-background">
      {/* Horizontal Ads */}
      <section className="py-6">
        <div>
          <HorizontalAds />
        </div>
      </section>

      {/* Client-side interactive component */}
      <HomeClient
        initialVideos={videos}
        initialStats={stats}
        allCategories={categories.sort()}
      />
    </div>
  )
}
