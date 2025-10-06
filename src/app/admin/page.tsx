'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'

export default function AdminDashboard() {
  const { data: session } = useSession()
  const [scraping, setScraping] = useState(false)
  const [endPage, setEndPage] = useState(10)
  const [stats, setStats] = useState<{
    totalVideos: number
    categories: Array<{ typeId: number; typeName: string; _count: number }>
  } | null>(null)
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState('')

  useEffect(() => {
    fetchStats()
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

  const scrapeVideos = async () => {
    if (endPage < 0) {
      setMessage('❌ Please enter a valid page number (0 or higher)')
      return
    }

    setScraping(true)
    const isInfinite = endPage === 0
    setMessage(isInfinite ? 'Starting scrape of all pages...' : `Starting scrape from page 1 to ${endPage}...`)
    setProgress('')

    let totalScraped = 0
    let totalErrors = 0
    let page = 1
    let hasMore = true

    try {
      while (hasMore && (isInfinite || page <= endPage)) {
        setProgress(isInfinite
          ? `Scraping page ${page}...`
          : `Scraping page ${page}/${endPage}...`
        )

        const res = await fetch('/api/scraper/videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page }),
        })

        const data = await res.json()

        if (data.success) {
          totalScraped += data.scraped
          hasMore = data.hasMore
          setProgress(isInfinite
            ? `✓ Page ${page} - Scraped ${data.scraped} videos (Total: ${data.totalVideos})`
            : `✓ Page ${page}/${endPage} - Scraped ${data.scraped} videos`
          )

          // If no more pages and we're in infinite mode, stop
          if (isInfinite && !hasMore) {
            break
          }
        } else {
          totalErrors++
          setProgress(isInfinite
            ? `✗ Page ${page} - Error: ${data.message}`
            : `✗ Page ${page}/${endPage} - Error: ${data.message}`
          )
        }

        page++

        // Small delay to avoid hammering the API
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      await fetchStats()
      setMessage(`✅ Complete! Scraped ${totalScraped} videos from ${page - 1} pages. Errors: ${totalErrors}`)
    } catch (error) {
      setMessage(`❌ Failed to scrape: ${error}`)
    } finally {
      setScraping(false)
      setProgress('')
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

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Scrape from page 1 to: <span className="text-gray-500 text-xs">(Enter 0 for all pages)</span>
          </label>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              min="0"
              value={endPage}
              onChange={(e) => setEndPage(parseInt(e.target.value) || 0)}
              disabled={scraping}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="10"
            />
            <button
              onClick={scrapeVideos}
              disabled={scraping}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {scraping ? 'Scraping...' : endPage === 0 ? 'Scrape All Pages' : `Scrape ${endPage} Page${endPage > 1 ? 's' : ''}`}
            </button>
            <button
              onClick={clearVideos}
              disabled={scraping}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
            >
              Clear All Videos
            </button>
          </div>
        </div>

        {progress && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700 mb-4">
            {progress}
          </div>
        )}

        {message && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
            {message}
          </div>
        )}

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