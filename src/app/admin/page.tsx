'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'

interface Category {
  id: number
  name: string
}

export default function AdminDashboard() {
  const { data: session } = useSession()

  // Category scraping states
  const [categoryScraping, setCategoryScraping] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [pagesPerCategory, setPagesPerCategory] = useState(5)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryProgress, setCategoryProgress] = useState('')

  // Stats and messages
  const [stats, setStats] = useState<{
    totalVideos: number
    categories: Array<{ typeId: number; typeName: string; _count: number }>
  } | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchStats()
    fetchCategories()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/scraper/videos')
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories')
      const data = await res.json()
      if (data.categories) {
        setCategories(data.categories)
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error)
    }
  }

  // Category-based scraping function
  const scrapeCategoryVideos = async () => {
    setCategoryScraping(true)
    setCategoryProgress('')

    try {
      if (selectedCategory === 'all') {
        // Scrape all categories
        setMessage(`Starting to scrape ${pagesPerCategory} pages from each category...`)
        setCategoryProgress('Fetching all categories...')

        const res = await fetch('/api/scraper/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pagesPerCategory }),
        })

        const data = await res.json()

        if (data.success) {
          await fetchStats()
          setMessage(`✅ All categories scraped! Total: ${data.totalScraped} videos from ${data.results.length} categories`)

          // Show detailed results
          const details = data.results
            .map((r: { category: string; scraped: number }) => `${r.category}: ${r.scraped} videos`)
            .join(', ')
          setCategoryProgress(`Results: ${details}`)
        } else {
          setMessage(`❌ Failed to scrape categories: ${data.message}`)
        }
      } else {
        // Scrape single category
        const category = categories.find(c => c.id.toString() === selectedCategory)
        if (!category) {
          setMessage('❌ Invalid category selected')
          return
        }

        const isInfinite = pagesPerCategory === 0
        setMessage(isInfinite
          ? `Starting to scrape all pages from ${category.name}...`
          : `Starting to scrape ${pagesPerCategory} pages from ${category.name}...`
        )

        let totalScraped = 0
        let totalErrors = 0
        let page = 1
        let hasMore = true

        while (hasMore && (isInfinite || page <= pagesPerCategory)) {
          setCategoryProgress(isInfinite
            ? `Scraping ${category.name} (page ${page})...`
            : `Scraping ${category.name} (page ${page}/${pagesPerCategory})...`
          )

          const res = await fetch('/api/scraper/videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              page,
              categoryId: category.id,
              categoryName: category.name,
            }),
          })

          const data = await res.json()

          if (data.success) {
            totalScraped += data.scraped
            hasMore = data.hasMore
            setCategoryProgress(isInfinite
              ? `✓ ${category.name} page ${page} - Scraped ${data.scraped} videos`
              : `✓ ${category.name} page ${page}/${pagesPerCategory} - Scraped ${data.scraped} videos`
            )

            if (isInfinite && !hasMore) {
              setCategoryProgress(`No more pages for ${category.name}`)
              break
            }
          } else {
            totalErrors++
            setCategoryProgress(isInfinite
              ? `✗ ${category.name} page ${page} - Error: ${data.message}`
              : `✗ ${category.name} page ${page}/${pagesPerCategory} - Error: ${data.message}`
            )
          }

          page++

          // Small delay
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        await fetchStats()
        setMessage(`✅ Category scrape complete! Scraped ${totalScraped} videos from ${category.name}. Errors: ${totalErrors}`)
      }
    } catch (error) {
      setMessage(`❌ Failed to scrape: ${error}`)
    } finally {
      setCategoryScraping(false)
      setTimeout(() => setCategoryProgress(''), 5000)
    }
  }

  const clearVideos = async () => {
    if (!confirm('Are you sure you want to delete all videos?')) return

    try {
      const res = await fetch('/api/scraper/videos', { method: 'DELETE' })
      const data = await res.json()

      if (data.success) {
        setMessage(`✓ Deleted ${data.deleted} videos`)
        await fetchStats()
      }
    } catch (error) {
      setMessage(`✗ Failed to delete: ${error}`)
    }
  }

  return (
    <div className="px-4 sm:px-0 space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">
        Dashboard
      </h2>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <p className="text-gray-700">
          Welcome back, {session?.user?.name || session?.user?.email}!
        </p>
        <p className="text-gray-500 mt-2">
          This is your admin dashboard. Use the navigation above to manage ads.
        </p>
      </div>

      {/* Video Scraper Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4">
          Video Scraper
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium">Total Videos</div>
            <div className="text-2xl font-bold text-blue-900 mt-1">
              {stats?.totalVideos || 0}
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-sm text-green-600 font-medium">Categories</div>
            <div className="text-2xl font-bold text-green-900 mt-1">
              {stats?.categories?.length || 0}
            </div>
          </div>
        </div>

        {/* Category-based Scraping */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h4 className="font-semibold text-gray-900 mb-3">
            Scrape Videos by Category
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={categoryScraping}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id.toString()}>
                    {cat.name} (ID: {cat.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pages per Category <span className="text-gray-500 text-xs">(Enter 0 for all pages)</span>
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={pagesPerCategory}
                onChange={(e) => setPagesPerCategory(parseInt(e.target.value) || 0)}
                disabled={categoryScraping}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="5"
              />
            </div>
          </div>

          <button
            onClick={scrapeCategoryVideos}
            disabled={categoryScraping}
            className="w-full md:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {categoryScraping
              ? 'Scraping Categories...'
              : selectedCategory === 'all'
                ? `Scrape All Categories (${pagesPerCategory} pages each)`
                : `Scrape Selected Category (${pagesPerCategory} pages)`
            }
          </button>
        </div>

        {/* Clear Database Button */}
        <div className="flex justify-end">
          <button
            onClick={clearVideos}
            disabled={categoryScraping}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Clear All Videos
          </button>
        </div>

        {/* Progress indicators */}
        {categoryProgress && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700 mb-4">
            {categoryProgress}
          </div>
        )}

        {message && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
            {message}
          </div>
        )}

        {/* Category Statistics */}
        {stats?.categories && stats.categories.length > 0 && (
          <div className="mt-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">
              Videos by Category
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {stats.categories.map((cat) => {
                const total = stats.totalVideos
                const percentage = total > 0 ? ((cat._count / total) * 100).toFixed(1) : '0'

                return (
                  <div
                    key={cat.typeId}
                    className="bg-gradient-to-br from-white to-gray-50 border-2 border-gray-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-gray-900">{cat.typeName}</div>
                      <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        #{cat.typeId}
                      </div>
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="text-3xl font-bold text-blue-600">
                        {cat._count}
                      </div>
                      <div className="text-sm text-gray-500">
                        {percentage}%
                      </div>
                    </div>
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}