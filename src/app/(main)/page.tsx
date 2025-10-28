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
      <section className="py-24 md:py-40 bg-gradient-to-b from-card/50 to-background relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-10 right-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-5 w-56 h-56 bg-accent/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-primary/3 rounded-full blur-2xl"></div>

        <div className="max-w-6xl mx-auto relative z-10">
          {/* Tag & Badge */}
          <div className="flex items-center justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/30">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
              <span className="text-sm font-bold text-primary">⚡ 超强视频库 | 日更新中</span>
            </div>
          </div>

          {/* Main Heading */}
          <div className="text-center mb-8">
            <h1 className="text-6xl md:text-7xl font-black text-foreground mb-4 leading-tight">
              <span className="block">发现精彩</span>
              <span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">视频世界</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-2">
              汇聚全球数百万部高清视频 • 覆盖所有热门类别 • 24小时更新
            </p>
            <div className="flex items-center justify-center gap-6 text-sm md:text-base">
              <div className="flex items-center gap-1 text-primary font-bold">
                <span>📺</span> {stats.totalVideos}+ 视频库
              </div>
              <div className="w-px h-6 bg-border"></div>
              <div className="flex items-center gap-1 text-accent font-bold">
                <span>✨</span> 今日更新 {stats.todayUpdates}
              </div>
              <div className="w-px h-6 bg-border"></div>
              <div className="flex items-center gap-1 text-foreground font-bold">
                <span>🎬</span> 高清体验
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="max-w-3xl mx-auto mb-20">
            <div className="relative group">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索您想看的内容... 演员、类型、关键词..."
                className="w-full px-8 py-6 pr-16 rounded-2xl border-2 border-border bg-card text-foreground placeholder-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 transition-all text-lg font-medium"
              />
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-gradient-to-r from-primary to-accent hover:shadow-lg hover:shadow-primary/50 text-primary-foreground p-3 rounded-xl transition-all transform group-hover:scale-110 font-bold text-sm"
              >
                <Search className="w-6 h-6" />
              </button>
            </div>
          </form>

          {/* Features Grid - More Visually Rich */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 rounded-2xl p-8 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/20 transition-all">
              <div className="text-4xl mb-4">📺</div>
              <h3 className="text-xl font-black text-foreground mb-2">海量资源</h3>
              <p className="text-muted-foreground font-medium">
                {stats.totalVideos}+ 部精选高清视频，每日不断更新
              </p>
              <div className="mt-4 h-1 w-12 bg-gradient-to-r from-primary to-transparent rounded"></div>
            </div>

            <div className="bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/30 rounded-2xl p-8 hover:border-accent/60 hover:shadow-lg hover:shadow-accent/20 transition-all">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-black text-foreground mb-2">极速体验</h3>
              <p className="text-muted-foreground font-medium">
                4K 超清流媒体，0 卡顿播放体验
              </p>
              <div className="mt-4 h-1 w-12 bg-gradient-to-r from-accent to-transparent rounded"></div>
            </div>

            <div className="bg-gradient-to-br from-yellow-500/20 to-yellow-500/5 border border-yellow-500/30 rounded-2xl p-8 hover:border-yellow-500/60 hover:shadow-lg hover:shadow-yellow-500/20 transition-all">
              <div className="text-4xl mb-4">✨</div>
              <h3 className="text-xl font-black text-foreground mb-2">精选推荐</h3>
              <p className="text-muted-foreground font-medium">
                智能算法推荐，发现您喜爱的内容
              </p>
              <div className="mt-4 h-1 w-12 bg-gradient-to-r from-yellow-500 to-transparent rounded"></div>
            </div>
          </div>

          {/* Call to Action Text */}
          <div className="text-center">
            <p className="text-muted-foreground text-lg mb-4">
              🎯 立即开始探索 • 完全免费 • 无需注册
            </p>
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
      </section>
    </div>
  )
}