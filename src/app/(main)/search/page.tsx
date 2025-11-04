import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import HorizontalAds from '@/components/HorizontalAds'
import SearchClient from './search-client'
import { CONSOLIDATED_CATEGORIES, CONSOLIDATED_TO_CHINESE } from '@/lib/maccms-mappings'

export const metadata: Metadata = {
  title: '搜索视频 - MD8AV',
  description: '搜索和浏览MD8AV平台上的视频内容。使用关键词或分类筛选，快速找到您感兴趣的视频。',
  keywords: ['视频搜索', '搜索', '视频查找', 'MD8AV搜索', '视频筛选'],
}

function getConsolidatedCategories() {
  return CONSOLIDATED_CATEGORIES.map((cat, index) => ({
    id: index + 1, // Use index as ID since these are not database categories
    name: cat,
    displayName: CONSOLIDATED_TO_CHINESE[cat] || cat
  }))
}

interface SearchVideo {
  id: string
  title: string
  preview: string
  duration: string
  views: string
  provider: string
}

async function searchVideos(query: string, page: number = 1): Promise<{ videos: SearchVideo[], totalCount: number }> {
  try {
    const skip = (page - 1) * 24

    const whereClause = {
      vodName: {
        contains: query,
      }
    }

    // Get total count
    const totalCount = await prisma.video.count({
      where: whereClause
    })

    const videos = await prisma.video.findMany({
      where: whereClause,
      select: {
        vodId: true,
        vodName: true,
        vodPic: true,
        vodRemarks: true,
        views: true,
        vodProvider: true,
      },
      orderBy: {
        views: 'desc'
      },
      skip,
      take: 24,
    })

    return {
      videos: videos.map(video => ({
        id: video.vodId,
        title: video.vodName,
        preview: video.vodPic || '',
        duration: video.vodRemarks || '',
        views: video.views.toString(),
        provider: video.vodProvider || '',
      })),
      totalCount
    }
  } catch (error) {
    console.error('[Search] Error searching videos:', error)
    return { videos: [], totalCount: 0 }
  }
}

async function getVideosByCategory(consolidatedCategory: string, page: number = 1): Promise<{ videos: SearchVideo[], categoryName: string, totalCount: number }> {
  try {
    const skip = (page - 1) * 24

    // Import DATABASE_TO_CONSOLIDATED to get all database categories that map to this consolidated category
    const { DATABASE_TO_CONSOLIDATED } = await import('@/lib/maccms-mappings')

    // Get all database category names that map to this consolidated category
    const dbCategories = Object.entries(DATABASE_TO_CONSOLIDATED)
      .filter(([_, consolidated]) => consolidated === consolidatedCategory)
      .map(([dbCat, _]) => dbCat)

    if (dbCategories.length === 0) {
      return { videos: [], categoryName: '', totalCount: 0 }
    }

    const whereClause = {
      typeName: {
        in: dbCategories
      }
    }

    // Get total count
    const totalCount = await prisma.video.count({
      where: whereClause
    })

    const videos = await prisma.video.findMany({
      where: whereClause,
      select: {
        vodId: true,
        vodName: true,
        vodPic: true,
        vodRemarks: true,
        views: true,
        vodProvider: true,
      },
      orderBy: {
        views: 'desc'
      },
      skip,
      take: 24,
    })

    // Get the Chinese display name for the category
    const displayName = CONSOLIDATED_TO_CHINESE[consolidatedCategory] || consolidatedCategory

    return {
      videos: videos.map(video => ({
        id: video.vodId,
        title: video.vodName,
        preview: video.vodPic || '',
        duration: video.vodRemarks || '',
        views: video.views.toString(),
        provider: video.vodProvider || '',
      })),
      categoryName: displayName,
      totalCount
    }
  } catch (error) {
    console.error('[Search] Error fetching category videos:', error)
    return { videos: [], categoryName: '', totalCount: 0 }
  }
}

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>
}) {
  const { q = '', category = '', page = '1' } = await searchParams
  const currentPage = parseInt(page)

  const categories = getConsolidatedCategories()

  let videos: SearchVideo[] = []
  let categoryName = ''
  let totalCount = 0

  if (category) {
    const result = await getVideosByCategory(category, currentPage)
    videos = result.videos
    categoryName = result.categoryName
    totalCount = result.totalCount
  } else if (q) {
    const result = await searchVideos(q, currentPage)
    videos = result.videos
    totalCount = result.totalCount
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Horizontal Ads */}
      <section className="py-6">
        <div className="px-4 sm:px-6 lg:px-8">
          <HorizontalAds />
        </div>
      </section>

      {/* Search Client Component */}
      <SearchClient
        initialVideos={videos}
        categories={categories}
        searchQuery={q}
        categoryId={category}
        categoryName={categoryName}
        currentPage={currentPage}
        totalCount={totalCount}
      />

      {/* Bottom Horizontal Ads */}
      <section className="py-6">
        <div className="px-4 sm:px-6 lg:px-8">
          <HorizontalAds />
        </div>
      </section>
    </div>
  )
}
