'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, Eye, Star, User, ChevronLeft } from 'lucide-react'
import HorizontalAds from '@/components/HorizontalAds'

interface Video {
  id: string
  title: string
  preview: string
  duration: string
  views: string
  rating?: string
  provider?: string
}

export default function SearchPage() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''

  const [searchResults, setSearchResults] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  useEffect(() => {
    if (!query) {
      setLoading(false)
      return
    }

    fetchSearchResults(currentPage)
  }, [query, currentPage])

  const fetchSearchResults = async (page: number) => {
    try {
      setLoading(true)

      const response = await fetch(`/api/search/${encodeURIComponent(query)}?page=${page}`)
      const data = await response.json()

      setSearchResults(data.data || [])
      setHasMore(data.data && data.data.length > 0)
    } catch (error) {
      console.error('Failed to fetch search results:', error)
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

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-2xl font-bold text-blue-300">
              视频中心
            </Link>
            <Link
              href="/"
              className="text-gray-600 hover:text-blue-300 transition-colors flex items-center gap-2"
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

      {/* Search Results Section */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            搜索结果: {query}
          </h1>
          <div className="h-1 w-20 bg-gradient-to-r from-blue-300 to-indigo-300 rounded-full"></div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden border border-gray-200 animate-pulse">
                <div className="w-full h-48 bg-gray-200"></div>
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">没有找到相关视频</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 mt-4 text-blue-300 hover:text-blue-400"
            >
              <ChevronLeft className="w-5 h-5" />
              返回首页
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResults.map((video) => (
                <Link
                  key={video.id}
                  href={`/watch/${video.id}${video.provider ? `?provider=${encodeURIComponent(video.provider)}` : ''}`}
                  className="bg-white rounded-xl overflow-hidden border border-gray-200 hover:border-blue-300 transition-all group"
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
                    <h3 className="font-medium text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-300 transition-colors">
                      {video.title}
                    </h3>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 leading-none">
                          <Eye className="w-4 h-4" />
                          <span className="leading-none">{video.views}</span>
                        </span>
                        {video.provider && (
                          <span className="flex items-center gap-1 max-w-[120px] leading-none">
                            <User className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate leading-none">{video.provider}</span>
                          </span>
                        )}
                      </div>
                      {video.rating && (
                        <span className="flex items-center gap-1 leading-none">
                          <Star className="w-4 h-4" />
                          <span className="leading-none">{video.rating}%</span>
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {searchResults.length > 0 && (
              <div className="flex items-center justify-center gap-4 mt-12">
                <button
                  onClick={goToPrevPage}
                  disabled={currentPage === 1}
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${
                    currentPage === 1
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-white text-blue-300 border-2 border-blue-300 hover:bg-blue-300 hover:text-white'
                  }`}
                >
                  上一页
                </button>

                <div className="flex items-center gap-2 px-6 py-3 bg-white rounded-lg border border-gray-200">
                  <span className="text-gray-600">第</span>
                  <span className="text-blue-300 font-bold text-lg">{currentPage}</span>
                  <span className="text-gray-600">页</span>
                </div>

                <button
                  onClick={goToNextPage}
                  disabled={!hasMore}
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${
                    !hasMore
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-300 text-white hover:bg-blue-400'
                  }`}
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8 mt-12">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="text-center text-gray-500 text-sm">
            <p>© 2024 视频中心. 保留所有权利.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}