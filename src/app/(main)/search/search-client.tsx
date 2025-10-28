'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, Eye, User, ChevronDown } from 'lucide-react'
import VideoPreview from '@/components/VideoPreview'

interface Video {
  id: string
  title: string
  preview: string
  duration: string
  views: string
  provider?: string
}

interface Category {
  id: number
  name: string
}

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

export default function SearchClient({
  initialVideos,
  categories,
  searchQuery,
  categoryId,
  categoryName,
  currentPage,
}: {
  initialVideos: Video[]
  categories: Category[]
  searchQuery: string
  categoryId: string
  categoryName: string
  currentPage: number
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  const handleCategorySelect = (catId: number | null) => {
    setIsCategoryDropdownOpen(false)

    const params = new URLSearchParams(searchParams.toString())

    if (catId === null) {
      params.delete('category')
    } else {
      params.set('category', catId.toString())
      params.delete('q')
      params.delete('page')
    }

    router.push(`/search?${params.toString()}`)
  }

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', page.toString())
    router.push(`/search?${params.toString()}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const hasResults = initialVideos.length > 0

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {categoryId && categoryName
                ? `分类: ${categoryName}`
                : searchQuery
                ? `搜索结果: ${searchQuery}`
                : '浏览视频'}
            </h1>
            <div className="h-1 w-20 bg-gradient-to-r from-primary to-accent rounded-full"></div>
          </div>

          {/* Category Filter Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary min-w-[150px]"
            >
              <span className="text-foreground font-medium">
                {categoryId && categoryName ? categoryName : '选择分类'}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground transition-transform ml-auto ${
                  isCategoryDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {isCategoryDropdownOpen && (
              <div className="absolute right-0 sm:right-auto sm:left-0 mt-2 w-64 max-h-96 overflow-y-auto bg-card border border-border rounded-lg shadow-lg shadow-primary/10 z-20">
                {/* All Categories Option */}
                <button
                  onClick={() => handleCategorySelect(null)}
                  className="w-full px-4 py-2 text-left hover:bg-muted transition-colors border-b border-border"
                >
                  <span className="text-foreground font-medium">所有分类</span>
                </button>

                {/* Category List */}
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category.id)}
                    className={`w-full px-4 py-2 text-left hover:bg-muted transition-colors ${
                      categoryId === category.id.toString()
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground'
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

      {!hasResults ? (
        <div className="text-center py-12">
          <Search className="w-16 h-16 text-muted mx-auto mb-4" />
          <p className="text-muted-foreground text-lg">
            {categoryId
              ? '该分类暂无视频'
              : searchQuery
              ? '没有找到相关视频'
              : '请选择分类或搜索视频'}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 mt-4 text-primary hover:text-primary/80"
          >
            返回首页
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {initialVideos.map((video) => (
              <Link
                key={video.id}
                href={`/watch/${video.id}${video.provider ? `?provider=${encodeURIComponent(video.provider)}` : ''}`}
                className="bg-card rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-all group hover:shadow-lg hover:shadow-primary/10"
              >
                <VideoPreview
                  preview={video.preview}
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
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {initialVideos.length > 0 && (
            <div className="flex items-center justify-center gap-4 mt-12">
              <button
                onClick={() => goToPage(currentPage - 1)}
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
                onClick={() => goToPage(currentPage + 1)}
                disabled={initialVideos.length < 12}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  initialVideos.length < 12
                    ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
