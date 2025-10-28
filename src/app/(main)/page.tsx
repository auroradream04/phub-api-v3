'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
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

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [featuredVideos, setFeaturedVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [stats, setStats] = useState({ totalVideos: 0, todayUpdates: 0 })

  useEffect(() => {
    // Fetch featured videos when page changes
    fetchFeaturedVideos(currentPage)
  }, [currentPage])

  const fetchFeaturedVideos = async (page: number) => {
    try {
      setLoading(true)

      const response = await fetch(`/api/home?page=${page}`)

      // Check if response is OK before parsing
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[Homepage] API Error:', response.status, errorData)
        throw new Error(errorData.error || `API returned ${response.status}`)
      }

      const data = await response.json()

      // Validate response structure
      if (!data.data || !Array.isArray(data.data)) {
        console.error('[Homepage] Invalid response structure:', data)
        throw new Error('Invalid response from API')
      }

      setFeaturedVideos(data.data)

      // Update stats if available
      if (data.stats) {
        setStats(data.stats)
      }

      // Check if there are more pages
      setHasMore(!data.paging?.isEnd)
    } catch (error) {
      console.error('[Homepage] Failed to fetch videos:', error)
      // Show error to user instead of silently failing
      setFeaturedVideos([])
      setHasMore(false)
      // TODO: Add toast notification or error banner to UI
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
        <div>
          <HorizontalAds />
        </div>
      </section>

      {/* Featured Videos Section - Table Layout */}
      <section className="py-12">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-2">影片资源列表</h2>
            <div className="h-1 w-20 bg-gradient-to-r from-primary to-accent rounded-full"></div>
            <p className="text-muted-foreground mt-2">
              今日更新: <span className="text-primary font-semibold">{stats.todayUpdates}</span> |
              本站总计: <span className="text-primary font-semibold">{stats.totalVideos}</span>
            </p>
          </div>

          {loading ? (
            <div className="space-y-0">
              {[...Array(20)].map((_, i) => (
                <div key={i} className="h-10 bg-card rounded-none border-b border-border/20 animate-pulse first:rounded-t last:rounded-b last:border-0"></div>
              ))}
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block bg-card rounded-lg border border-border/40 overflow-hidden">
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
                    {featuredVideos.map((video) => {
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
                          <span className="line-clamp-1">{video.category?.split(',')[0] || '未分类'}</span>
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
                {featuredVideos.map((video) => {
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
          {!loading && featuredVideos.length > 0 && (
            <div className="flex items-center justify-center gap-4 mt-8">
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
    </div>
  )
}