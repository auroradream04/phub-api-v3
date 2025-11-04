import HorizontalAds from '@/components/HorizontalAds'
import HomeClient from './home-client'
import { CONSOLIDATED_CATEGORIES } from '@/lib/maccms-mappings'

interface Category {
  name: string
}

async function getInitialData() {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

  try {
    const videosRes = await fetch(`${baseUrl}/api/db/home?page=1`, { cache: 'no-store' })
    const videosData = await videosRes.json()

    return {
      videos: videosData.data || [],
      stats: videosData.stats || { totalVideos: 0, todayUpdates: 0 }
    }
  } catch (error) {
    console.error('[Homepage Server] Failed to fetch initial data:', error)
    return {
      videos: [],
      stats: { totalVideos: 0, todayUpdates: 0 }
    }
  }
}

export default async function Home() {
  const { videos, stats } = await getInitialData()

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
        allCategories={[...CONSOLIDATED_CATEGORIES]}
      />
    </div>
  )
}
