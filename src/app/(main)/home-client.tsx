'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { getCategoryChineseName } from '@/lib/category-mapping'
import { CONSOLIDATED_CATEGORIES, CONSOLIDATED_TO_CHINESE } from '@/lib/maccms-mappings'
import HorizontalAds from '@/components/HorizontalAds'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

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
        const response = await fetch(`/api/db/home?page=${currentPage + 1}`)
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
        const response = await fetch(`/api/db/home?page=${currentPage - 1}`)
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

  // Videos are already filtered server-side based on selectedCategory
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

          {/* API Endpoints */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">资源接口</span>
            </div>

            {/* API Links - 2 column grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              {/* XML API Link */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative bg-card border-2 border-border/50 rounded-lg p-4 hover:border-primary/50 transition-all">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="px-2 py-1 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-bold rounded">
                        XML
                      </div>
                      <span className="text-sm font-medium text-foreground">XML 接口</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${appUrl}/api/provide/vod?ac=list&at=xml`)
                        // Optional: Add toast notification here
                      }}
                      className="px-3 py-1 bg-muted hover:bg-primary hover:text-primary-foreground text-xs font-medium rounded transition-colors"
                    >
                      复制
                    </button>
                  </div>
                  <a
                    href={`${appUrl}/api/provide/vod?ac=list&at=xml`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors break-all font-mono"
                  >
                    {appUrl}/api/provide/vod?ac=list&at=xml
                  </a>
                </div>
              </div>

              {/* JSON API Link */}
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative bg-card border-2 border-border/50 rounded-lg p-4 hover:border-primary/50 transition-all">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="px-2 py-1 bg-gradient-to-r from-green-600 to-green-500 text-white text-xs font-bold rounded">
                        JSON
                      </div>
                      <span className="text-sm font-medium text-foreground">JSON 接口</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${appUrl}/api/provide/vod?ac=list`)
                        // Optional: Add toast notification here
                      }}
                      className="px-3 py-1 bg-muted hover:bg-primary hover:text-primary-foreground text-xs font-medium rounded transition-colors"
                    >
                      复制
                    </button>
                  </div>
                  <a
                    href={`${appUrl}/api/provide/vod?ac=list`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors break-all font-mono"
                  >
                    {appUrl}/api/provide/vod?ac=list
                  </a>
                </div>
              </div>
            </div>

            {/* Telegram Button - Full width */}
            <a
              href={telegramLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block group relative cursor-pointer"
            >
              <div className="absolute inset-0 bg-[#2AABEE]/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <button className="relative w-full h-14 bg-[#2AABEE] hover:bg-[#229ED9] text-white font-bold rounded-lg transition-all duration-200 flex items-center justify-center gap-3 shadow-md hover:shadow-lg">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.941z"/>
                </svg>
                <span className="text-base">立即加入 Telegram 群组</span>
              </button>
            </a>
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

      {/* Featured Videos Section - Table Layout */}
      <section className="pt-12 pb-4">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">影片资源列表</h2>
          <div className="h-1 w-20 bg-gradient-to-r from-primary to-accent rounded-full"></div>
          <p className="text-muted-foreground mt-2">
            今日更新: <span className="text-primary font-semibold">{initialStats.todayUpdates}</span> |
            本站总计: <span className="text-primary font-semibold">{initialStats.totalVideos}</span>
          </p>
        </div>

        {/* Category Filters */}
        {allCategories.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              onClick={() => handleCategoryChange(null)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedCategory === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-foreground border border-border hover:border-primary'
              }`}
            >
              全部
            </button>
            {allCategories.map((category) => {
              const chineseName = CONSOLIDATED_TO_CHINESE[category] || category
              return (
                <button
                  key={category}
                  onClick={() => handleCategoryChange(category)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    selectedCategory === category
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-foreground border border-border hover:border-primary'
                  }`}
                >
                  {chineseName}
                </button>
              )
            })}
          </div>
        )}

        {loading ? (
          <div className="space-y-0">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="h-10 bg-card rounded-none border-b border-border/20 animate-pulse first:rounded-t last:rounded-b last:border-0"></div>
            ))}
          </div>
        ) : (
          <>
            {/* Pagination Bar - Top */}
            <div className="hidden md:flex px-4 py-2 border-t border-b border-l border-r border-border bg-muted/30 items-center justify-between w-full rounded-tl-lg rounded-tr-lg">
              <span className="text-xs text-muted-foreground">
                <span className="text-primary font-bold">{totalCount.toLocaleString()}</span> 个视频
              </span>
              <div className="flex gap-2 items-center text-xs">
                <button
                  onClick={goToPrevPage}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-xs text-muted-foreground">
                  {currentPage} / {totalPages || 1}
                </span>
                <button
                  onClick={goToNextPage}
                  disabled={!hasMore}
                  className="px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block bg-card border border-border/40 overflow-hidden pb-1 border-t-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border/30">
                    <TableHead className="font-bold text-foreground py-2 h-auto">影片名称</TableHead>
                    <TableHead className="font-bold text-foreground w-[100px] text-center py-2 h-auto">影片类型</TableHead>
                    <TableHead className="font-bold text-foreground w-[120px] text-center py-2 h-auto">获取地址</TableHead>
                    <TableHead className="font-bold text-foreground w-[120px] text-center py-2 h-auto">更新时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVideos.map((video) => {
                    // Determine tags to show - ORDER MATTERS! HOT first (leftmost)
                    const tags = [];

                    // Check if views > 100k for HOT tag (appears first/leftmost)
                    // Parse views string like "1.2M" or "500K" to number
                    const parseViews = (viewsStr: string) => {
                      const str = viewsStr?.trim().toUpperCase() || '0';
                      if (str.includes('M')) {
                        return parseFloat(str) * 1000000;
                      } else if (str.includes('K')) {
                        return parseFloat(str) * 1000;
                      }
                      return parseInt(str) || 0;
                    };
                    const viewCount = parseViews(video.views);
                    if (viewCount > 100000) tags.push({ label: '热门', color: 'from-red-600 to-red-500', pulse: true });

                    // Check if video is from past 24 hours for NEW tag
                    if (video.createdAt) {
                      const videoDate = new Date(video.createdAt);
                      const now = new Date();
                      const hoursDiff = (now.getTime() - videoDate.getTime()) / (1000 * 60 * 60);
                      if (hoursDiff < 24) {
                        tags.push({ label: '新', color: 'from-green-600 to-green-500', pulse: false });
                      }
                    }

                    if (video.duration) tags.push({ label: 'HD', color: 'from-amber-500 to-yellow-400', pulse: false });

                    return (
                    <TableRow key={video.id} className="hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0">
                      <TableCell className="font-medium text-foreground py-2 h-auto">
                        <div className="flex items-center gap-2">
                          {/* Tags on the left */}
                          <div className="flex gap-1 flex-shrink-0">
                            {tags.map((tag) => (
                              <span
                                key={tag.label}
                                className={`px-2 py-0.5 text-xs font-semibold rounded text-white bg-gradient-to-r ${tag.color} whitespace-nowrap shadow-sm ${tag.pulse ? 'pulse-hot' : ''}`}
                              >
                                {tag.label}
                              </span>
                            ))}
                          </div>
                          <span className="line-clamp-1">{video.title}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground py-2 h-auto">
                        <span className="line-clamp-1">
                          {video.category
                            ? getCategoryChineseName(video.category.split(',')[0].trim())
                            : '未分类'
                          }
                        </span>
                      </TableCell>
                      <TableCell className="text-center py-2 h-auto">
                        <Link href={`/watch/${video.id}`}>
                          <button className="px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-xs font-medium transition-colors whitespace-nowrap">
                            点击进入
                          </button>
                        </Link>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground text-xs py-2 h-auto">
                        <span className="line-clamp-1">2025-10-28</span>
                      </TableCell>
                    </TableRow>
                  );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-0 border-t border-border/20">
              {filteredVideos.map((video) => {
                // Determine tags to show - ORDER MATTERS! HOT first (leftmost)
                const tags = [];

                // Check if views > 100k for HOT tag (appears first/leftmost)
                // Parse views string like "1.2M" or "500K" to number
                const parseViews = (viewsStr: string) => {
                  const str = viewsStr?.trim().toUpperCase() || '0';
                  if (str.includes('M')) {
                    return parseFloat(str) * 1000000;
                  } else if (str.includes('K')) {
                    return parseFloat(str) * 1000;
                  }
                  return parseInt(str) || 0;
                };
                const viewCount = parseViews(video.views);
                if (viewCount > 100000) tags.push({ label: '热门', color: 'from-red-600 to-red-500', pulse: true });

                // Check if video is from past 24 hours for NEW tag
                if (video.createdAt) {
                  const videoDate = new Date(video.createdAt);
                  const now = new Date();
                  const hoursDiff = (now.getTime() - videoDate.getTime()) / (1000 * 60 * 60);
                  if (hoursDiff < 24) {
                    tags.push({ label: '新', color: 'from-green-600 to-green-500', pulse: false });
                  }
                }

                if (video.duration) tags.push({ label: 'HD', color: 'from-amber-500 to-yellow-400', pulse: false });

                return (
                <div key={video.id} className="flex items-center gap-2 p-2 border-b border-border/20 hover:bg-muted/30 transition-colors">
                  <div className="flex gap-1 flex-shrink-0">
                    {tags.map((tag) => (
                      <span
                        key={tag.label}
                        className={`px-1.5 py-0.5 text-xs font-semibold rounded text-white bg-gradient-to-r ${tag.color} whitespace-nowrap ${tag.pulse ? 'pulse-hot' : ''}`}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                  <h3 className="font-medium text-foreground text-sm line-clamp-1 flex-1">
                    {video.title}
                  </h3>
                  <Link href={`/watch/${video.id}`}>
                    <button className="px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0">
                      进入
                    </button>
                  </Link>
                </div>
              );
              })}
            </div>
          </>
        )}

        {/* Pagination */}
        {!loading && filteredVideos.length > 0 && (
          <div className="px-4 py-2 border-t border-b border-l border-r border-border bg-muted/30 flex items-center justify-between w-full rounded-bl-lg rounded-br-lg">
            <span className="text-xs text-muted-foreground">
              <span className="text-primary font-bold">{totalCount.toLocaleString()}</span> 个视频
            </span>
            <div className="flex gap-2 items-center text-xs">
              <button
                onClick={goToPrevPage}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-muted-foreground">
                {currentPage} / {totalPages || 1}
              </span>
              <button
                onClick={goToNextPage}
                disabled={!hasMore}
                className="px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Horizontal Ads - Bottom */}
      <section className="py-6">
        <div>
          <HorizontalAds />
        </div>
      </section>
    </>
  )
}
