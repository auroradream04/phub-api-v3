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

interface CacheStatsType {
  inMemoryStats: {
    totalEntries: number
    totalSizeMB: string
    hitRate: string
    uptimeMinutes: number
    stats: {
      totalSets: number
      totalGets: number
      totalClears: number
      totalHits: number
      totalMisses: number
    }
    byType: Record<string, { count: number; size: number; hits: number }>
    entries: Array<{ key: string; type: string; sizeMB: string; hitCount: number; ageMinutes: number }>
  }
  databaseStats: {
    totalLogs: number
    last24Hours: number
    byAction: Array<{ action: string; _count: { id: number } }>
  }
  recentLogs: Array<{ id: string; action: string; target: string | null; videoId: string | null; success: boolean; timestamp: string }>
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

  // Crash recovery scraper states
  const [recoveryScraping, setRecoveryScraping] = useState(false)
  const [recoveryCheckpointId, setRecoveryCheckpointId] = useState('')
  const [recoveryCheckpoint, setRecoveryCheckpoint] = useState<any>(null)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryPages, setRecoveryPages] = useState(5)

  // Stats and messages
  const [stats, setStats] = useState<{
    totalVideos: number
    categories: Array<{ typeId: number; typeName: string; _count: number }>
  } | null>(null)
  const [message, setMessage] = useState('')

  // Cache management
  const [cacheMessage, setCacheMessage] = useState('')
  const [cacheLoading, setCacheLoading] = useState(false)
  const [cacheVideoId, setCacheVideoId] = useState('')

  // Cache stats
  const [cacheStats, setCacheStats] = useState<CacheStatsType | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  useEffect(() => {
    fetchStats()
    fetchCategories()
    fetchCacheStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/scraper/videos')
      const data = await res.json()
      setStats(data)
    } catch (error) {

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

    }
  }

  const fetchCacheStats = async () => {
    try {
      setStatsLoading(true)
      const res = await fetch('/api/admin/cache/stats')
      const data = await res.json()
      setCacheStats(data)
    } catch (error) {

    } finally {
      setStatsLoading(false)
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

  // Crash recovery scraper
  const startRecoveryScraper = async () => {
    try {
      setRecoveryScraping(true)
      setMessage('Starting crash-recovery scraper...')

      const res = await fetch('/api/scraper/categories-with-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagesPerCategory: recoveryPages,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setRecoveryCheckpointId(data.checkpointId)
        setMessage(`✓ Scraper started! Checkpoint ID: ${data.checkpointId}`)
        setCategoryProgress(`Scraping in progress. You can monitor or close this page.`)

        // Auto-refresh checkpoint status
        const interval = setInterval(async () => {
          const checkRes = await fetch(`/api/scraper/categories-with-recovery?checkpointId=${data.checkpointId}`)
          const checkData = await checkRes.json()
          if (checkData.success) {
            setRecoveryCheckpoint(checkData.checkpoint)
          }
        }, 10000) // Refresh every 10 seconds

        return interval
      } else {
        setMessage(`✗ Failed to start scraper: ${data.message}`)
      }
    } catch (error) {
      setMessage(`✗ Error starting scraper: ${error}`)
    } finally {
      setRecoveryScraping(false)
    }
  }

  const resumeFromCheckpoint = async () => {
    if (!recoveryCheckpointId.trim()) {
      setMessage('❌ Please enter a checkpoint ID')
      return
    }

    try {
      setRecoveryScraping(true)
      setMessage(`Resuming from checkpoint ${recoveryCheckpointId}...`)

      const res = await fetch('/api/scraper/categories-with-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagesPerCategory: recoveryPages,
          resumeCheckpointId: recoveryCheckpointId,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setMessage(`✓ Scraper resumed! Checkpoint ID: ${data.checkpointId}`)
        setCategoryProgress(`Scraping in progress. You can monitor or close this page.`)
      } else {
        setMessage(`✗ Failed to resume: ${data.message}`)
      }
    } catch (error) {
      setMessage(`✗ Error resuming scraper: ${error}`)
    } finally {
      setRecoveryScraping(false)
    }
  }

  const checkCheckpointStatus = async () => {
    if (!recoveryCheckpointId.trim()) {
      setMessage('❌ Please enter a checkpoint ID')
      return
    }

    try {
      setRecoveryLoading(true)
      const res = await fetch(`/api/scraper/categories-with-recovery?checkpointId=${recoveryCheckpointId}`)
      const data = await res.json()

      if (data.success) {
        setRecoveryCheckpoint(data.checkpoint)
        setMessage(`✓ Checkpoint found - Status: ${data.checkpoint.status}`)
      } else {
        setMessage(`✗ Checkpoint not found`)
      }
    } catch (error) {
      setMessage(`✗ Error checking checkpoint: ${error}`)
    } finally {
      setRecoveryLoading(false)
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

  const clearCache = async () => {
    setCacheLoading(true)
    setCacheMessage('')

    try {
      const res = await fetch('/api/admin/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: cacheVideoId.trim() || undefined
        })
      })

      const data = await res.json()

      if (res.ok) {
        setCacheMessage(`✅ ${data.message}`)
        setCacheVideoId('')
        setTimeout(() => setCacheMessage(''), 5000)
      } else {
        setCacheMessage(`❌ ${data.error || 'Failed to clear cache'}`)
      }
    } catch (error) {
      setCacheMessage(`❌ Error: ${error}`)
    } finally {
      setCacheLoading(false)
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

        {/* Crash Recovery Scraper */}
        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-4">
          <h4 className="font-semibold text-foreground mb-3">
            Crash-Recovery Scraper (Recommended)
          </h4>
          <p className="text-sm text-muted-foreground mb-4">
            Scrapes all categories with automatic crash recovery. If it crashes, you can resume from the exact point it left off!
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Pages per Category
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={recoveryPages}
                onChange={(e) => setRecoveryPages(parseInt(e.target.value) || 5)}
                disabled={recoveryScraping}
                className="w-full px-4 py-2 border border-border bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="5"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Checkpoint ID (to resume)
              </label>
              <input
                type="text"
                value={recoveryCheckpointId}
                onChange={(e) => setRecoveryCheckpointId(e.target.value)}
                disabled={recoveryScraping}
                className="w-full px-4 py-2 border border-border bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="scrape_xxx_xxx"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                onClick={checkCheckpointStatus}
                disabled={recoveryScraping || !recoveryCheckpointId}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {recoveryLoading ? 'Checking...' : 'Check Status'}
              </button>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={startRecoveryScraper}
              disabled={recoveryScraping}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {recoveryScraping ? 'Starting...' : 'Start New Scrape'}
            </button>

            <button
              onClick={resumeFromCheckpoint}
              disabled={recoveryScraping || !recoveryCheckpointId}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {recoveryScraping ? 'Resuming...' : 'Resume from Checkpoint'}
            </button>
          </div>

          {recoveryCheckpoint && (
            <div className="mt-4 p-4 bg-card rounded-lg border border-border">
              <h5 className="font-semibold text-foreground mb-2">Checkpoint Status</h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p className="font-medium text-foreground capitalize">{recoveryCheckpoint.status}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Videos Scraped:</span>
                  <p className="font-medium text-foreground">{recoveryCheckpoint.totalVideosScraped}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Errors:</span>
                  <p className="font-medium text-foreground">{recoveryCheckpoint.totalVideosFailed}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Categories:</span>
                  <p className="font-medium text-foreground">{recoveryCheckpoint.categories.length}</p>
                </div>
              </div>
            </div>
          )}
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

      {/* Cache Management Section */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-xl font-bold text-foreground mb-4">
          Cache Management
        </h3>

        <p className="text-muted-foreground mb-4">
          Clear cached data to force API routes to refetch data from PornHub. Cache expires automatically every 2 hours.
        </p>

        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <h4 className="font-semibold text-foreground mb-3">
            Clear Cache
          </h4>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Video ID (Leave empty to clear all video cache)
              </label>
              <input
                type="text"
                value={cacheVideoId}
                onChange={(e) => setCacheVideoId(e.target.value)}
                disabled={cacheLoading}
                placeholder="e.g., ph5a9634c9a827e"
                className="w-full px-4 py-2 border border-border bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter a specific PornHub video ID to clear only that video&apos;s cache, or leave empty to clear all video caches.
              </p>
            </div>

            <button
              onClick={clearCache}
              disabled={cacheLoading}
              className="w-full px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {cacheLoading ? 'Clearing Cache...' : cacheVideoId.trim() ? `Clear Cache for Video: ${cacheVideoId.trim()}` : 'Clear All Video Cache'}
            </button>

            {cacheMessage && (
              <div className={`border-l-4 rounded-lg p-4 text-sm ${
                cacheMessage.includes('✅')
                  ? 'bg-primary/10 border-primary'
                  : 'bg-destructive/10 border-destructive'
              }`}>
                <p className={`font-medium ${
                  cacheMessage.includes('✅')
                    ? 'text-primary'
                    : 'text-destructive'
                }`}>
                  {cacheMessage}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cache Statistics Section */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-foreground">
            Cache Statistics
          </h3>
          <button
            onClick={fetchCacheStats}
            disabled={statsLoading}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            {statsLoading ? 'Refreshing...' : 'Refresh Stats'}
          </button>
        </div>

        {cacheStats ? (
          <div className="space-y-6">
            {/* In-Memory Cache Stats */}
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <h4 className="font-semibold text-foreground mb-4">In-Memory Cache</h4>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
                  <div className="text-xs text-primary font-medium mb-1">Cached Items</div>
                  <div className="text-2xl font-bold text-foreground">
                    {cacheStats.inMemoryStats.totalEntries}
                  </div>
                </div>

                <div className="bg-accent/10 border border-accent/30 rounded-lg p-3">
                  <div className="text-xs text-accent font-medium mb-1">Total Size</div>
                  <div className="text-2xl font-bold text-foreground">
                    {cacheStats.inMemoryStats.totalSizeMB}
                    <span className="text-sm text-muted-foreground">MB</span>
                  </div>
                </div>

                <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-3">
                  <div className="text-xs text-green-500 font-medium mb-1">Hit Rate</div>
                  <div className="text-2xl font-bold text-foreground">
                    {cacheStats.inMemoryStats.hitRate}%
                  </div>
                </div>

                <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3">
                  <div className="text-xs text-blue-500 font-medium mb-1">Uptime</div>
                  <div className="text-2xl font-bold text-foreground">
                    {cacheStats.inMemoryStats.uptimeMinutes}
                    <span className="text-sm text-muted-foreground">m</span>
                  </div>
                </div>
              </div>

              {/* Stats Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                <div className="bg-card rounded p-2 border border-border">
                  <div className="text-muted-foreground">Sets</div>
                  <div className="font-bold text-foreground">{cacheStats.inMemoryStats.stats.totalSets}</div>
                </div>
                <div className="bg-card rounded p-2 border border-border">
                  <div className="text-muted-foreground">Gets</div>
                  <div className="font-bold text-foreground">{cacheStats.inMemoryStats.stats.totalGets}</div>
                </div>
                <div className="bg-card rounded p-2 border border-border">
                  <div className="text-muted-foreground">Hits</div>
                  <div className="font-bold text-green-500">{cacheStats.inMemoryStats.stats.totalHits}</div>
                </div>
                <div className="bg-card rounded p-2 border border-border">
                  <div className="text-muted-foreground">Misses</div>
                  <div className="font-bold text-red-500">{cacheStats.inMemoryStats.stats.totalMisses}</div>
                </div>
                <div className="bg-card rounded p-2 border border-border">
                  <div className="text-muted-foreground">Clears</div>
                  <div className="font-bold text-foreground">{cacheStats.inMemoryStats.stats.totalClears}</div>
                </div>
              </div>
            </div>

            {/* Cache by Type */}
            {Object.keys(cacheStats.inMemoryStats.byType).length > 0 && (
              <div className="bg-muted/50 border border-border rounded-lg p-4">
                <h4 className="font-semibold text-foreground mb-4">Cache by Type</h4>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {Object.entries(cacheStats.inMemoryStats.byType).map(([type, data]: [string, { count: number; size: number; hits: number }]) => (
                    <div key={type} className="bg-card rounded-lg p-3 border border-border">
                      <div className="text-sm font-medium text-foreground mb-2 capitalize">{type}</div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>Items: <span className="font-bold text-foreground">{data.count}</span></div>
                        <div>Size: <span className="font-bold text-foreground">{(data.size / 1024).toFixed(1)}KB</span></div>
                        <div>Hits: <span className="font-bold text-green-500">{data.hits}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Cached Entries */}
            {cacheStats.inMemoryStats.entries.length > 0 && (
              <div className="bg-muted/50 border border-border rounded-lg p-4 overflow-x-auto">
                <h4 className="font-semibold text-foreground mb-4">Top Cached Entries</h4>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Key</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Type</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Size</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Hits</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-medium">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cacheStats.inMemoryStats.entries.map((entry: { key: string; type: string; sizeMB: string; hitCount: number; ageMinutes: number }) => (
                      <tr key={entry.key} className="border-b border-border/50 hover:bg-card/50">
                        <td className="py-2 px-2 font-mono text-xs text-foreground truncate">{entry.key}</td>
                        <td className="py-2 px-2">
                          <span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium capitalize">
                            {entry.type}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-foreground">{entry.sizeMB}MB</td>
                        <td className="py-2 px-2 text-green-500 font-bold">{entry.hitCount}</td>
                        <td className="py-2 px-2 text-muted-foreground">{entry.ageMinutes}m ago</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Database Logs */}
            {cacheStats.databaseStats && (
              <div className="bg-muted/50 border border-border rounded-lg p-4">
                <h4 className="font-semibold text-foreground mb-4">Database Logs</h4>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  <div className="bg-card rounded p-3 border border-border">
                    <div className="text-xs text-muted-foreground mb-1">Total Logs</div>
                    <div className="text-2xl font-bold text-foreground">
                      {cacheStats.databaseStats.totalLogs}
                    </div>
                  </div>

                  <div className="bg-card rounded p-3 border border-border">
                    <div className="text-xs text-muted-foreground mb-1">Last 24h</div>
                    <div className="text-2xl font-bold text-foreground">
                      {cacheStats.databaseStats.last24Hours}
                    </div>
                  </div>

                  <div className="bg-card rounded p-3 border border-border">
                    <div className="text-xs text-muted-foreground mb-1">Actions</div>
                    <div className="text-2xl font-bold text-foreground">
                      {cacheStats.databaseStats.byAction.length}
                    </div>
                  </div>
                </div>

                {/* Recent Logs */}
                {cacheStats.recentLogs.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Action</th>
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Target</th>
                          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cacheStats.recentLogs.slice(0, 10).map((log: { id: string; action: string; target: string | null; timestamp: string }) => (
                          <tr key={log.id} className="border-b border-border/50">
                            <td className="py-2 px-2">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-medium ${
                                  log.action === 'clear'
                                    ? 'bg-red-900/20 text-red-500'
                                    : log.action === 'set'
                                    ? 'bg-green-900/20 text-green-500'
                                    : 'bg-blue-900/20 text-blue-500'
                                }`}
                              >
                                {log.action}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-foreground font-mono">{log.target || 'N/A'}</td>
                            <td className="py-2 px-2 text-muted-foreground">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : statsLoading ? (
          <div className="text-center py-8">
            <div className="inline-block">
              <svg
                className="h-8 w-8 text-primary animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
            <p className="text-muted-foreground mt-4">Loading cache statistics...</p>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No cache statistics available
          </div>
        )}
      </div>
    </div>
  )
}