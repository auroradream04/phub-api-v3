import type { Metadata } from 'next'
import HorizontalAds from '@/components/HorizontalAds'
import HomeClient from './home-client'
import { CONSOLIDATED_CATEGORIES } from '@/lib/maccms-mappings'

export const metadata: Metadata = {
  title: 'MD8AV - 高品质视频内容聚合平台',
  description: '探索最新最热门的视频内容，涵盖多个分类的精选视频集合。MD8AV为您提供高质量的视频浏览体验，每日更新优质内容。',
  keywords: ['视频平台', '在线视频', '视频聚合', 'MD8AV', '高清视频', '视频内容'],
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

      {/* Horizontal Ads - Bottom */}
      <section className="py-6">
        <div>
          <HorizontalAds />
        </div>
      </section>
    </div>
  )
}
