'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'

interface Video {
  id: string
  title: string
  preview: string
  duration: string
  views: string
  rating?: string
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

      // Fetch 2 pages worth of videos (24 total)
      const apiPage1 = (page - 1) * 2 + 1
      const apiPage2 = apiPage1 + 1

      const [response1, response2] = await Promise.all([
        fetch(`/api/search/hot?page=${apiPage1}`),
        fetch(`/api/search/hot?page=${apiPage2}`)
      ])

      const [data1, data2] = await Promise.all([
        response1.json(),
        response2.json()
      ])

      const allVideos = [...(data1.data || []), ...(data2.data || [])]
      setFeaturedVideos(allVideos)

      // Check if there are more videos (if second page has results)
      setHasMore(data2.data && data2.data.length > 0)
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/" className="text-2xl font-bold text-orange-500">
                视频中心
              </Link>
              <nav className="hidden md:flex space-x-6">
                <Link href="/" className="text-gray-700 hover:text-orange-500 transition-colors">
                  首页
                </Link>
                <Link href="/trending" className="text-gray-700 hover:text-orange-500 transition-colors">
                  热门
                </Link>
                <Link href="/categories" className="text-gray-700 hover:text-orange-500 transition-colors">
                  分类
                </Link>
              </nav>
            </div>
            <Link
              href="/admin"
              className="text-sm text-gray-600 hover:text-orange-500 transition-colors"
            >
              管理后台
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section with Search */}
      <section className="bg-gradient-to-br from-orange-50 to-red-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              探索精彩视频内容
            </h1>
            <p className="text-lg text-gray-600 mb-8">
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
                className="w-full px-6 py-4 pr-14 rounded-full border-2 border-orange-200 focus:border-orange-400 focus:outline-none bg-white shadow-lg text-gray-900 placeholder-gray-400 transition-all"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-orange-500 hover:bg-orange-600 text-white p-3 rounded-full transition-colors"
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
                className="px-4 py-2 bg-white text-gray-700 rounded-full hover:bg-orange-500 hover:text-white transition-colors shadow-sm border border-gray-200"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Videos Section */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">热门推荐</h2>
            <div className="h-1 w-20 bg-gradient-to-r from-orange-500 to-red-500 rounded-full"></div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(24)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl overflow-hidden shadow-md animate-pulse">
                  <div className="w-full h-48 bg-gray-200"></div>
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {featuredVideos.map((video) => (
                <Link
                  key={video.id}
                  href={`/watch/${video.id}`}
                  className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all transform hover:-translate-y-1 group"
                >
                  <div className="relative w-full h-48 bg-gray-100 overflow-hidden">
                    <img
                      src={video.preview}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                      {video.duration}
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-gray-900 mb-2 line-clamp-2 group-hover:text-orange-500 transition-colors">
                      {video.title}
                    </h3>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span className="flex items-center">
                        <span className="mr-1">👁️</span>
                        {video.views}
                      </span>
                      {video.rating && (
                        <span className="flex items-center">
                          <span className="mr-1">⭐</span>
                          {video.rating}%
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
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-orange-500 border-2 border-orange-500 hover:bg-orange-500 hover:text-white shadow-sm'
                }`}
              >
                上一页
              </button>

              <div className="flex items-center gap-2 px-6 py-3 bg-white rounded-lg shadow-sm border border-gray-200">
                <span className="text-gray-600">第</span>
                <span className="text-orange-500 font-bold text-lg">{currentPage}</span>
                <span className="text-gray-600">页</span>
              </div>

              <button
                onClick={goToNextPage}
                disabled={!hasMore}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  !hasMore
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm'
                }`}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-gray-500 text-sm">
            <p>© 2024 视频中心. 保留所有权利.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}