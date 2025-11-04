'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { getCategoryChineseName } from '@/lib/category-mapping'
import { CONSOLIDATED_CATEGORIES, CONSOLIDATED_TO_CHINESE } from '@/lib/maccms-mappings'

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

interface HomeClientProps {
  initialVideos: Video[]
  initialStats: { totalVideos: number; todayUpdates: number }
  allCategories: string[]
}

export default function HomeClient({ initialVideos, initialStats, allCategories }: HomeClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [featuredVideos, setFeaturedVideos] = useState<Video[]>(initialVideos)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const videosPerPage = 20
  const [totalCount, setTotalCount] = useState(initialStats.totalVideos)
  const [totalPages, setTotalPages] = useState(Math.ceil((initialStats.totalVideos || 0) / 20))

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const telegramLink = process.env.NEXT_PUBLIC_TELEGRAM_LINK || 'https://t.me/your_group'

  const handleCategoryChange = async (category: string | null) => {
    setSelectedCategory(category)
    setCurrentPage(1)
    setLoading(true)
    try {
      const categoryParam = category ? `&category=${encodeURIComponent(category)}` : ''
      const response = await fetch(`/api/db/home?page=1${categoryParam}`)
      const data = await response.json()
      setFeaturedVideos(data.data)
      const total = data.stats?.totalVideos || 0
      setTotalCount(total)
      setTotalPages(Math.ceil(total / videosPerPage))
      setHasMore(!data.paging?.isEnd)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`
    }
  }

  const goToNextPage = async () => {
    if (hasMore) {
      setLoading(true)
      try {
        const categoryParam = selectedCategory ? `&category=${encodeURIComponent(selectedCategory)}` : ''
        const response = await fetch(`/api/db/home?page=${currentPage + 1}${categoryParam}`)
        const data = await response.json()
        setFeaturedVideos(data.data)
        setHasMore(!data.paging?.isEnd)
        setCurrentPage(currentPage + 1)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } finally {
        setLoading(false)
      }
    }
  }

  const goToPrevPage = async () => {
    if (currentPage > 1) {
      setLoading(true)
      try {
        const categoryParam = selectedCategory ? `&category=${encodeURIComponent(selectedCategory)}` : ''
        const response = await fetch(`/api/db/home?page=${currentPage - 1}${categoryParam}`)
        const data = await response.json()
        setFeaturedVideos(data.data)
        setHasMore(!data.paging?.isEnd)
        setCurrentPage(currentPage - 1)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } finally {
        setLoading(false)
      }
    }
  }

  const filteredVideos = featuredVideos

  return (
    <>
      {/* Hero Section with Search */}
      <section className="py-8 md:py-12 border-b border-border/30">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-1 h-6 bg-primary rounded"></div>
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">视频平台</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3 leading-tight">
              探索无限视频世界
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl">
              高清视频库，涵盖多种类型和主题。搜索您喜爱的内容，随时随地享受最佳观影体验。
            </p>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch}>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索视频..."
                className="w-full px-6 py-3 pr-14 rounded-lg border-2 border-border/50 bg-card text-foreground placeholder-muted-foreground/70 focus:border-primary focus:outline-none transition-all"
              />
              <button
                type="submit"
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-md transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Featured Videos Section - Sidebar Layout */}
      <section className="py-12 max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">影片资源列表</h2>
          <div className="h-1 w-20 bg-gradient-to-r from-primary to-accent rounded-full"></div>
          <p className="text-muted-foreground mt-2">
            今日更新: <span className="text-primary font-semibold">{initialStats.todayUpdates}</span> |
            本站总计: <span className="text-primary font-semibold">{initialStats.totalVideos}</span>
          </p>
        </div>

        {/* Two-column layout: Categories + Videos */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[600px]">
          {/* Left Sidebar - Categories */}
          <div className="lg:col-span-1 border border-border rounded-lg overflow-hidden bg-muted/30 flex flex-col">
            <div className="px-4 py-3 border-b border-border bg-muted/50">
              <h3 className="text-sm font-semibold text-foreground">分类</h3>
            </div>
            <div className="overflow-y-auto flex-1">
              <div className="divide-y divide-border">
                <button
                  onClick={() => handleCategoryChange(null)}
                  className={`w-full text-left px-4 py-3 hover:bg-muted transition-colors ${
                    selectedCategory === null ? 'bg-primary/10 border-l-2 border-primary' : ''
                  }`}
                >
                  <span className="text-sm font-medium text-foreground">全部</span>
                </button>
                {allCategories.map((category) => {
                  const chineseName = CONSOLIDATED_TO_CHINESE[category] || category
                  return (
                    <button
                      key={category}
                      onClick={() => handleCategoryChange(category)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted transition-colors ${
                        selectedCategory === category ? 'bg-primary/10 border-l-2 border-primary' : ''
                      }`}
                    >
                      <span className="text-sm font-medium text-foreground">{chineseName}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right Panel - Videos */}
          <div className="lg:col-span-3 border border-border rounded-lg overflow-hidden bg-muted/30 flex flex-col">
            <div className="px-4 py-3 border-b border-border bg-muted/50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {selectedCategory ? `${selectedCategory}` : '全部视频'}
              </h3>
              <span className="text-xs text-muted-foreground">
                共 {totalCount.toLocaleString()} 个
              </span>
            </div>
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="space-y-0">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="h-12 bg-card rounded-none border-b border-border/20 animate-pulse first:rounded-t last:rounded-b last:border-0"></div>
                  ))}
                </div>
              ) : featuredVideos.length > 0 ? (
                <div className="divide-y divide-border">
                  {featuredVideos.map((video) => (
                    <div key={video.id} className="px-4 py-3 hover:bg-muted/50 transition-colors flex items-start gap-3 justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-2">{video.title}</p>
                        <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                          <span>{video.views} views</span>
                          {video.category && <span>•</span>}
                          {video.category && <span>{video.category}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <a
                          href={`/watch/${video.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors"
                          title="View video"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No videos found
                </div>
              )}
            </div>
            {/* Pagination */}
            {!loading && featuredVideos.length > 0 && (
              <div className="px-4 py-3 border-t border-border bg-muted/50 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {totalCount.toLocaleString()} 个视频
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPrevPage}
                    disabled={currentPage === 1}
                    className="px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    上一页
                  </button>
                  <span className="text-muted-foreground">
                    {currentPage} / {totalPages || 1}
                  </span>
                  <button
                    onClick={goToNextPage}
                    disabled={!hasMore}
                    className="px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
