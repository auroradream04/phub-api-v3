import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import HorizontalAds from '@/components/HorizontalAds'
import SearchClient from './search-client'

async function getCategories() {
  try {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        id: 'asc'
      }
    })

    return categories.map(cat => ({
      id: cat.id,
      name: cat.name
    }))
  } catch (error) {
    console.error('[Search] Error fetching categories:', error)
    return []
  }
}

interface SearchVideo {
  id: string
  title: string
  preview: string
  duration: string
  views: string
  provider: string
}

async function searchVideos(query: string, page: number = 1): Promise<SearchVideo[]> {
  try {
    const skip = (page - 1) * 12

    const videos = await prisma.video.findMany({
      where: {
        vodName: {
          contains: query,
        }
      },
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
      take: 12,
    })

    return videos.map(video => ({
      id: video.vodId,
      title: video.vodName,
      preview: video.vodPic || '',
      duration: video.vodRemarks || '',
      views: video.views.toString(),
      provider: video.vodProvider || '',
    }))
  } catch (error) {
    console.error('[Search] Error searching videos:', error)
    return []
  }
}

async function getVideosByCategory(categoryId: string, page: number = 1): Promise<{ videos: SearchVideo[], categoryName: string }> {
  try {
    const skip = (page - 1) * 12

    const category = await prisma.category.findUnique({
      where: { id: parseInt(categoryId) }
    })

    if (!category) return { videos: [], categoryName: '' }

    const videos = await prisma.video.findMany({
      where: {
        typeId: parseInt(categoryId)
      },
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
      take: 12,
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
      categoryName: category.name
    }
  } catch (error) {
    console.error('[Search] Error fetching category videos:', error)
    return { videos: [], categoryName: '' }
  }
}

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>
}) {
  const { q = '', category = '', page = '1' } = await searchParams
  const currentPage = parseInt(page)

  const categories = await getCategories()

  let videos: SearchVideo[] = []
  let categoryName = ''

  if (category) {
    const result = await getVideosByCategory(category, currentPage)
    videos = result.videos
    categoryName = result.categoryName
  } else if (q) {
    videos = await searchVideos(q, currentPage)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-2xl font-bold text-primary">
              视频中心
            </Link>
            <Link
              href="/"
              className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" />
              返回首页
            </Link>
          </div>
        </div>
      </header>

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
      />

      {/* Footer */}
      <footer className="bg-card/50 border-t border-border py-8 mt-12">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="text-center text-muted-foreground text-sm">
            <p>© 2024 视频中心. 保留所有权利.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
