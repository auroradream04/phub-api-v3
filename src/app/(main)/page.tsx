'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, Eye, Star, User } from 'lucide-react'
import HorizontalAds from '@/components/HorizontalAds'
import VideoPreview from '@/components/VideoPreview'

interface Video {
  id: string
  title: string
  preview: string
  previewVideo?: string
  duration: string
  views: string
  rating?: string
  provider?: string
}

// Helper function to format views with k/m suffixes
function formatViews(views: string): string {
  const num = parseInt(views.replace(/,/g, ''))
  if (isNaN(num)) return views

  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'm'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k'
  }
  return num.toString()
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [featuredVideos, setFeaturedVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    // Fetch featured videos when page changes
    fetchFeaturedVideos(currentPage)
  }, [currentPage])

  const fetchFeaturedVideos = async (page: number) => {
    try {
      setLoading(true)

      const response = await fetch(`/api/home?page=${page}`)
      const data = await response.json()

      setFeaturedVideos(data.data || [])

      // Check if there are more pages
      setHasMore(!data.paging?.isEnd)
    } catch (error) {
      console.error('Failed to fetch videos:', error)
    } finally {
      setLoading(false)
    }
  }

  const goToNextPage = () => {
    if (hasMore) {
      setCurrentPage(prev => prev + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/" className="text-2xl font-bold text-primary">
                视频中心
              </Link>
              <nav className="hidden md:flex space-x-6">
                <Link href="/" className="text-foreground/80 hover:text-primary transition-colors">
                  首页
                </Link>
                <Link href="/trending" className="text-foreground/80 hover:text-primary transition-colors">
                  热门
                </Link>
                <Link href="/categories" className="text-foreground/80 hover:text-primary transition-colors">
                  分类
                </Link>
                <Link href="/docs" className="text-foreground/80 hover:text-primary transition-colors font-medium">
                  文档
                </Link>
              </nav>
            </div>
            <Link
              href="/admin"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              管理后台
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section with Search */}
      <section className="bg-gradient-to-b from-background to-card/50 py-16 relative overflow-hidden">
        {/* Gradient orbs for visual interest */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl"></div>

        <div className="px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              探索精彩视频内容
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              高清视频，流畅播放，精彩不断
            </p>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索您想看的内容..."
                className="w-full px-6 py-4 pr-14 rounded-full border-2 border-border bg-input text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary hover:bg-primary/90 text-primary-foreground p-3 rounded-full transition-all hover:scale-105"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
          </form>

          {/* Quick Search Tags */}
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            {['热门', '最新', '推荐', '高清', '精选'].map((tag) => (
              <button
                key={tag}
                onClick={() => setSearchQuery(tag)}
                className="px-4 py-2 bg-card text-foreground rounded-full hover:bg-primary hover:text-primary-foreground transition-all border border-border hover:border-primary hover:scale-105"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Horizontal Ads */}
      <section className="py-6">
        <div className="px-4 sm:px-6 lg:px-8">
          <HorizontalAds />
        </div>
      </section>

      {/* Featured Videos Section */}
      <section className="py-12">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-2">热门推荐</h2>
            <div className="h-1 w-20 bg-gradient-to-r from-primary to-accent rounded-full"></div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(24)].map((_, i) => (
                <div key={i} className="bg-card rounded-xl overflow-hidden border border-border animate-pulse">
                  <div className="w-full h-48 bg-muted"></div>
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {featuredVideos.map((video) => (
                <Link
                  key={video.id}
                  href={`/watch/${video.id}${video.provider ? `?provider=${encodeURIComponent(video.provider)}` : ''}`}
                  className="bg-card rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-all group hover:shadow-lg hover:shadow-primary/10"
                >
                  <VideoPreview
                    preview={video.preview}
                    previewVideo={video.previewVideo}
                    title={video.title}
                    duration={video.duration}
                    className="group-hover:scale-110 transition-transform duration-300"
                  />
                  <div className="p-4 flex flex-col h-[110px]">
                    <h3 className="font-medium text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors flex-1">
                      {video.title}
                    </h3>
                    <div className="flex items-center justify-between text-sm text-muted-foreground mt-auto">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 leading-none">
                          <Eye className="w-4 h-4 text-primary/60" />
                          <span className="leading-none">{formatViews(video.views)}</span>
                        </span>
                        {video.provider && (
                          <span className="flex items-center gap-1 max-w-[120px] leading-none">
                            <User className="w-4 h-4 flex-shrink-0 text-primary/60" />
                            <span className="truncate leading-none">{video.provider}</span>
                          </span>
                        )}
                      </div>
                      {video.rating && (
                        <span className="flex items-center gap-1 leading-none">
                          <Star className="w-4 h-4 text-accent fill-accent" />
                          <span className="leading-none">{video.rating}%</span>
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && featuredVideos.length > 0 && (
            <div className="flex items-center justify-center gap-4 mt-12">
              <button
                onClick={goToPrevPage}
                disabled={currentPage === 1}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  currentPage === 1
                    ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                    : 'bg-card text-primary border-2 border-primary hover:bg-primary hover:text-primary-foreground'
                }`}
              >
                上一页
              </button>

              <div className="flex items-center gap-2 px-6 py-3 bg-card rounded-lg border border-border">
                <span className="text-muted-foreground">第</span>
                <span className="text-primary font-bold text-lg">{currentPage}</span>
                <span className="text-muted-foreground">页</span>
              </div>

              <button
                onClick={goToNextPage}
                disabled={!hasMore}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  !hasMore
                    ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </section>

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