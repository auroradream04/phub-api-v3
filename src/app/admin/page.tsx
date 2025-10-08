'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'

interface Category {
  id: number
  name: string
}

interface ProgressState {
  currentCategory: string
  currentPage: number
  totalPages: number
  categoryIndex: number
  totalCategories: number
  scrapedCount: number
  errorCount: number
  isRateLimited: boolean
}

export default function AdminDashboard() {
  const { data: session } = useSession()

  // Category scraping states
  const [categoryScraping, setCategoryScraping] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [pagesPerCategory, setPagesPerCategory] = useState(5)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryProgress, setCategoryProgress] = useState('')
  const [progress, setProgress] = useState<ProgressState | null>(null)

  // Cancel ref
  const cancelRef = useRef(false)

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

  // Cancel scraping
  const cancelScraping = () => {
    cancelRef.current = true
    setMessage('⏸️ Cancelling scraping...')
  }

  // Category-based scraping function
  const scrapeCategoryVideos = async () => {
    setCategoryScraping(true)
    setCategoryProgress('')
    setProgress(null)
    cancelRef.current = false

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
          // Check for cancel
          if (cancelRef.current) {
            setMessage(`⏸️ Scraping cancelled by user. Scraped ${totalScraped} videos before cancellation.`)
            break
          }

          // Update progress state
          setProgress({
            currentCategory: category.name,
            currentPage: page,
            totalPages: isInfinite ? 0 : pagesPerCategory,
            categoryIndex: 1,
            totalCategories: 1,
            scrapedCount: totalScraped,
            errorCount: totalErrors,
            isRateLimited: false
          })

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

          // Check for rate limiting
          if (res.status === 429) {
            setProgress(prev => prev ? { ...prev, isRateLimited: true } : null)
            setCategoryProgress(`⚠️ Rate limited! Waiting 5 seconds before retrying...`)
            await new Promise(resolve => setTimeout(resolve, 5000))
            continue // Retry same page
          }

          const data = await res.json()

          // Check for rate limit in error message
          if (!data.success && data.message && data.message.toLowerCase().includes('rate limit')) {
            setProgress(prev => prev ? { ...prev, isRateLimited: true } : null)
            setCategoryProgress(`⚠️ Rate limited! Waiting 5 seconds before retrying...`)
            await new Promise(resolve => setTimeout(resolve, 5000))
            continue // Retry same page
          }

          if (data.success) {
            totalScraped += data.scraped
            hasMore = data.hasMore

            // Update progress with new count
            setProgress(prev => prev ? { ...prev, scrapedCount: totalScraped, isRateLimited: false } : null)

            setCategoryProgress(isInfinite
              ? `✓ ${category.name} page ${page} - Scraped ${data.scraped} videos (Total: ${totalScraped})`
              : `✓ ${category.name} page ${page}/${pagesPerCategory} - Scraped ${data.scraped} videos (Total: ${totalScraped})`
            )

            if (isInfinite && !hasMore) {
              setCategoryProgress(`No more pages for ${category.name}`)
              break
            }
          } else {
            totalErrors++
            setProgress(prev => prev ? { ...prev, errorCount: totalErrors, isRateLimited: false } : null)
            setCategoryProgress(isInfinite
              ? `✗ ${category.name} page ${page} - Error: ${data.message}`
              : `✗ ${category.name} page ${page}/${pagesPerCategory} - Error: ${data.message}`
            )
          }

          page++

          // Delay between requests to avoid rate limiting (1-2 seconds)
          await new Promise(resolve => setTimeout(resolve, 1500))
        }

        await fetchStats()
        if (!cancelRef.current) {
          setMessage(`✅ Category scrape complete! Scraped ${totalScraped} videos from ${category.name}. Errors: ${totalErrors}`)
        }
      }
    } catch (error) {
      setMessage(`❌ Failed to scrape: ${error}`)
    } finally {
      setCategoryScraping(false)
      setProgress(null)
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
      <h2 className="text-2xl font-bold text-foreground">
        Dashboard
      </h2>

      <div className="bg-card border border-border rounded-lg p-6">
        <p className="text-foreground">
          Welcome back, {session?.user?.name || session?.user?.email}!
        </p>
        <p className="text-muted-foreground mt-2">
          This is your admin dashboard. Use the navigation above to manage ads.
        </p>
      </div>

      {/* Video Scraper Section */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-xl font-bold text-foreground mb-4">
          Video Scraper
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
            <div className="text-sm text-primary font-medium">Total Videos</div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {stats?.totalVideos || 0}
            </div>
          </div>

          <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
            <div className="text-sm text-accent font-medium">Categories</div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {stats?.categories?.length || 0}
            </div>
          </div>
        </div>

        {/* Category-based Scraping */}
        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-4">
          <h4 className="font-semibold text-foreground mb-3">
            Scrape Videos by Category
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Select Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={categoryScraping}
                className="w-full px-4 py-2 border border-border bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
              <label className="block text-sm font-medium text-foreground mb-2">
                Pages per Category <span className="text-muted-foreground text-xs">(Enter 0 for all pages)</span>
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={pagesPerCategory}
                onChange={(e) => setPagesPerCategory(parseInt(e.target.value) || 0)}
                disabled={categoryScraping}
                className="w-full px-4 py-2 border border-border bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="5"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={scrapeCategoryVideos}
              disabled={categoryScraping}
              className="flex-1 md:flex-initial px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {categoryScraping
                ? 'Scraping Categories...'
                : selectedCategory === 'all'
                  ? `Scrape All Categories (${pagesPerCategory} pages each)`
                  : `Scrape Selected Category (${pagesPerCategory} pages)`
              }
            </button>

            {categoryScraping && (
              <button
                onClick={cancelScraping}
                className="px-6 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Enhanced Progress Display */}
        {progress && (
          <div className="bg-gradient-to-br from-card to-muted/30 border-2 border-primary/30 rounded-lg p-6 mb-4 shadow-lg shadow-primary/10">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-bold text-foreground">
                  Scraping Progress
                </h4>
                {progress.isRateLimited && (
                  <span className="px-3 py-1 bg-yellow-900/20 border border-yellow-600/50 text-yellow-500 text-sm font-medium rounded-full animate-pulse">
                    ⚠️ Rate Limited
                  </span>
                )}
              </div>

              {/* Current Category & Page */}
              <div className="bg-card rounded-lg p-4 border border-border">
                <div className="text-sm text-muted-foreground mb-1">Currently Scraping:</div>
                <div className="text-xl font-bold text-primary">
                  {progress.currentCategory}
                  {progress.totalPages > 0 && (
                    <span className="text-base text-muted-foreground ml-2">
                      (Page {progress.currentPage} of {progress.totalPages})
                    </span>
                  )}
                  {progress.totalPages === 0 && (
                    <span className="text-base text-muted-foreground ml-2">
                      (Page {progress.currentPage})
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {progress.totalPages > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-foreground">
                    <span>Progress</span>
                    <span className="font-medium text-primary">
                      {Math.round((progress.currentPage / progress.totalPages) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-4 overflow-hidden shadow-inner">
                    <div
                      className="bg-gradient-to-r from-primary to-accent h-4 rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-2"
                      style={{ width: `${Math.min((progress.currentPage / progress.totalPages) * 100, 100)}%` }}
                    >
                      {progress.currentPage > 0 && (
                        <span className="text-xs text-primary-foreground font-bold">
                          {Math.round((progress.currentPage / progress.totalPages) * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
                  <div className="text-xs text-primary font-medium mb-1">Videos Scraped</div>
                  <div className="text-2xl font-bold text-foreground">{progress.scrapedCount}</div>
                </div>

                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                  <div className="text-xs text-destructive font-medium mb-1">Errors</div>
                  <div className="text-2xl font-bold text-foreground">{progress.errorCount}</div>
                </div>

                <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 col-span-2 md:col-span-1">
                  <div className="text-xs text-accent font-medium mb-1">Current Page</div>
                  <div className="text-2xl font-bold text-foreground">
                    {progress.currentPage}
                    {progress.totalPages > 0 && `/${progress.totalPages}`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Clear Database Button */}
        <div className="flex justify-end">
          <button
            onClick={clearVideos}
            disabled={categoryScraping}
            className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Clear All Videos
          </button>
        </div>

        {/* Progress indicators */}
        {categoryProgress && (
          <div className="bg-primary/10 border-l-4 border-primary rounded-lg p-4 text-sm mb-4 shadow-sm">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-primary animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-foreground font-medium">{categoryProgress}</p>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div className={`border-l-4 rounded-lg p-4 text-sm shadow-sm ${
            message.includes('✅') || message.includes('complete')
              ? 'bg-primary/10 border-primary'
              : message.includes('❌') || message.includes('Failed')
              ? 'bg-destructive/10 border-destructive'
              : message.includes('⚠️') || message.includes('Rate')
              ? 'bg-yellow-900/10 border-yellow-600/50'
              : message.includes('⏸️') || message.includes('Cancel')
              ? 'bg-orange-900/10 border-orange-600/50'
              : 'bg-muted/50 border-border'
          }`}>
            <p className={`font-medium ${
              message.includes('✅') || message.includes('complete')
                ? 'text-primary'
                : message.includes('❌') || message.includes('Failed')
                ? 'text-destructive'
                : message.includes('⚠️') || message.includes('Rate')
                ? 'text-yellow-500'
                : message.includes('⏸️') || message.includes('Cancel')
                ? 'text-orange-500'
                : 'text-foreground'
            }`}>
              {message}
            </p>
          </div>
        )}

        {/* Category Statistics */}
        {stats?.categories && stats.categories.length > 0 && (
          <div className="mt-6">
            <h4 className="text-lg font-semibold text-foreground mb-4">
              Videos by Category
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {stats.categories.map((cat) => {
                const total = stats.totalVideos
                const percentage = total > 0 ? ((cat._count / total) * 100).toFixed(1) : '0'

                return (
                  <div
                    key={cat.typeId}
                    className="bg-gradient-to-br from-card to-muted/30 border-2 border-border rounded-xl p-4 hover:border-primary/50 hover:shadow-md hover:shadow-primary/10 transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-foreground">{cat.typeName}</div>
                      <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                        #{cat.typeId}
                      </div>
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="text-3xl font-bold text-primary">
                        {cat._count}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {percentage}%
                      </div>
                    </div>
                    <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                      <div
                        className="bg-gradient-to-r from-primary to-accent h-1.5 rounded-full transition-all duration-500"
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