import HorizontalAds from '@/components/HorizontalAds'
import HomeClient from './home-client'

interface Video {
  id: string
  title: string
  preview: string
  previewVideo?: string
  duration: string
  views: string
  rating?: string
  category?: string
  createdAt?: string
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

    return {
      videos: videosData.data || [],
      stats: videosData.stats || { totalVideos: 0, todayUpdates: 0 },
      categories: categoriesData.categories?.map((cat: any) => cat.name) || []
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
