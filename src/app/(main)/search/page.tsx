'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Eye, Star, User, ChevronLeft, ChevronDown } from 'lucide-react'
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

interface Category {
  id: number
  name: string
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

function SearchResults() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const query = searchParams.get('q') || ''
  const categoryId = searchParams.get('category') || ''

  const [searchResults, setSearchResults] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // Category state
  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('')
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch categories on component mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('/api/categories')
        const data = await response.json()
        setCategories(data.categories || [])
      } catch (error) {
        console.error('Failed to fetch categories:', error)
      } finally {
        setCategoriesLoading(false)
      }
    }
    fetchCategories()
  }, [])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false)
      }
    }

    if (isCategoryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isCategoryDropdownOpen])

  const fetchSearchResults = async (page: number, searchQuery: string) => {
    try {
      setLoading(true)

      const response = await fetch(`/api/search/${encodeURIComponent(searchQuery)}?page=${page}`)
      const data = await response.json()

      setSearchResults(data.data || [])
      setHasMore(data.data && data.data.length > 0)
    } catch (error) {
      console.error('Failed to fetch search results:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategoryVideos = async (page: number, catId: string) => {
    try {
      setLoading(true)

      const response = await fetch(`/api/videos/category/${catId}?page=${page}`)
      const data = await response.json()

      setSearchResults(data.data || [])
      setHasMore(data.data && data.data.length > 0)

      // Set the category name from the response
      if (data.category && data.category.name) {
        setSelectedCategoryName(data.category.name)
      }
    } catch (error) {
      console.error('Failed to fetch category videos:', error)
    } finally {
      setLoading(false)
    }
  }

  // Handle fetching based on query or category
  useEffect(() => {
    if (categoryId) {
      // Fetch category videos
      fetchCategoryVideos(currentPage, categoryId)

      // Set category name from local categories list
      const category = categories.find(c => c.id.toString() === categoryId)
      if (category) {
        setSelectedCategoryName(category.name)
      }
    } else if (query) {
      // Fetch search results
      setSelectedCategoryName('')
      fetchSearchResults(currentPage, query)
    } else {
      // No query or category, clear results
      setSearchResults([])
      setSelectedCategoryName('')
      setLoading(false)
    }
  }, [query, categoryId, currentPage, categories])

  // Handle category selection
  const handleCategorySelect = (catId: number | null) => {
    setIsCategoryDropdownOpen(false)
    setCurrentPage(1) // Reset to first page

    const params = new URLSearchParams(searchParams.toString())

    if (catId === null) {
      // Clear category filter
      params.delete('category')
    } else {
      // Set category filter and remove search query
      params.set('category', catId.toString())
      params.delete('q')
    }

    router.push(`/search?${params.toString()}`)
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
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {categoryId && selectedCategoryName
                  ? `分类: ${selectedCategoryName}`
                  : query
                  ? `搜索结果: ${query}`
                  : '浏览视频'}
              </h1>
              <div className="h-1 w-20 bg-gradient-to-r from-blue-300 to-indigo-300 rounded-full"></div>
            </div>

            {/* Category Filter Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-[150px]"
                disabled={categoriesLoading}
              >
                <span className="text-gray-700 font-medium">
                  {categoryId && selectedCategoryName
                    ? selectedCategoryName
                    : '选择分类'}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-500 transition-transform ml-auto ${
                    isCategoryDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {isCategoryDropdownOpen && !categoriesLoading && (
                <div className="absolute right-0 sm:right-auto sm:left-0 mt-2 w-64 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                  {/* All Categories Option */}
                  <button
                    onClick={() => handleCategorySelect(null)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
                  >
                    <span className="text-gray-900 font-medium">所有分类</span>
                  </button>

                  {/* Category List */}
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => handleCategorySelect(category.id)}
                      className={`w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors ${
                        categoryId === category.id.toString()
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700'
                      }`}
                    >
                      <span>{category.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
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
            <p className="text-gray-500 text-lg">
              {categoryId
                ? '该分类暂无视频'
                : query
                ? '没有找到相关视频'
                : '请选择分类或搜索视频'}
            </p>
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
                  <div className="p-4 flex flex-col h-[110px]">
                    <h3 className="font-medium text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-300 transition-colors flex-1">
                      {video.title}
                    </h3>
                    <div className="flex items-center justify-between text-sm text-gray-500 mt-auto">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 leading-none">
                          <Eye className="w-4 h-4" />
                          <span className="leading-none">{formatViews(video.views)}</span>
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

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    }>
      <SearchResults />
    </Suspense>
  )
}