'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { PlayCircle, RefreshCw, Trash2, Database, Languages, ChevronDown, ChevronUp } from 'lucide-react'

interface Stats {
  totalVideos: number
  categories: Array<{ typeId: number; typeName: string; _count: number }>
}

interface RetryStats {
  total: number
  byRetryCount: Array<{ retries: number; count: number }>
}

interface ScraperProgress {
  checkpointId: string
  pagesPerCategory: number
  totalCategories: number
  categoriesCompleted: number
  totalVideosScraped: number
  totalVideosFailed: number
  currentCategory?: string
  currentPage?: number
  startedAt: string
  videosPerSecond?: number
  pagesPerSecond?: number
}

const STORAGE_KEY = 'scraper_progress'

export default function AdminDashboard() {
  const { data: session } = useSession()

  // States
  const [scraping, setScraping] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [retryStats, setRetryStats] = useState<RetryStats | null>(null)
  const [message, setMessage] = useState('')
  const [pagesPerCategory, setPagesPerCategory] = useState(5)
  const [retryLimit, setRetryLimit] = useState(100)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [checkpointId, setCheckpointId] = useState('')
  const [savedProgress, setSavedProgress] = useState<ScraperProgress | null>(null)
  const [currentProgress, setCurrentProgress] = useState<ScraperProgress | null>(null)
  const checkpointIdRef = useRef<string>('')

  // Check for saved progress on load
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Ensure clean data, no React elements
        const progress: ScraperProgress = {
          checkpointId: String(parsed.checkpointId || ''),
          pagesPerCategory: Number(parsed.pagesPerCategory || 0),
          totalCategories: Number(parsed.totalCategories || 0),
          categoriesCompleted: Number(parsed.categoriesCompleted || 0),
          totalVideosScraped: Number(parsed.totalVideosScraped || 0),
          totalVideosFailed: Number(parsed.totalVideosFailed || 0),
          currentCategory: parsed.currentCategory ? String(parsed.currentCategory) : undefined,
          currentPage: parsed.currentPage ? Number(parsed.currentPage) : undefined,
          startedAt: String(parsed.startedAt || new Date().toISOString())
        }
        setSavedProgress(progress)
      } catch (error) {
        console.error('Failed to parse saved progress:', error)
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  // Fetch stats on load
  useEffect(() => {
    fetchStats()
    fetchRetryStats()
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

  const fetchRetryStats = async () => {
    try {
      const res = await fetch('/api/scraper/retry-translations')
      const data = await res.json()
      if (data.success) setRetryStats(data)
    } catch (error) {
      console.error('Failed to fetch retry stats:', error)
    }
  }

  const saveProgress = (progress: ScraperProgress) => {
    try {
      // Ensure we only save plain data, no React elements or circular references
      const plainProgress: ScraperProgress = {
        checkpointId: typeof progress.checkpointId === 'string' ? progress.checkpointId : String(progress.checkpointId || ''),
        pagesPerCategory: typeof progress.pagesPerCategory === 'number' ? progress.pagesPerCategory : Number(progress.pagesPerCategory || 0),
        totalCategories: typeof progress.totalCategories === 'number' ? progress.totalCategories : Number(progress.totalCategories || 0),
        categoriesCompleted: typeof progress.categoriesCompleted === 'number' ? progress.categoriesCompleted : Number(progress.categoriesCompleted || 0),
        totalVideosScraped: typeof progress.totalVideosScraped === 'number' ? progress.totalVideosScraped : Number(progress.totalVideosScraped || 0),
        totalVideosFailed: typeof progress.totalVideosFailed === 'number' ? progress.totalVideosFailed : Number(progress.totalVideosFailed || 0),
        currentCategory: progress.currentCategory && typeof progress.currentCategory === 'string' ? progress.currentCategory : undefined,
        currentPage: progress.currentPage && typeof progress.currentPage === 'number' ? progress.currentPage : undefined,
        startedAt: typeof progress.startedAt === 'string' ? progress.startedAt : String(progress.startedAt || new Date().toISOString())
      }

      const serialized = JSON.stringify(plainProgress)
      localStorage.setItem(STORAGE_KEY, serialized)
      setCurrentProgress(plainProgress)
    } catch (error) {
      console.error('Failed to save progress:', error)
    }
  }

  const clearProgress = () => {
    localStorage.removeItem(STORAGE_KEY)
    setSavedProgress(null)
    setCurrentProgress(null)
  }

  const fetchCheckpointProgress = async (id: string) => {
    try {
      const [checkpointRes, categoriesRes] = await Promise.all([
        fetch(`/api/scraper/categories-with-recovery?checkpointId=${id}`),
        fetch(`/api/categories`)
      ])

      const checkpointData = await checkpointRes.json()
      const categoriesData = await categoriesRes.json()

      if (checkpointData.success && checkpointData.progress) {
        const startedAt = currentProgress?.startedAt || new Date().toISOString()
        const elapsedSeconds = (Date.now() - new Date(startedAt).getTime()) / 1000

        const totalVideos = checkpointData.progress.totalVideosScraped || 0
        const pagesProcessed = checkpointData.progress.categoriesCompleted * pagesPerCategory + (checkpointData.progress.categoriesCompleted === 0 ? 0 : 1)

        const progress: ScraperProgress = {
          checkpointId: String(id),
          pagesPerCategory: Number(pagesPerCategory),
          totalCategories: Number(categoriesData.total || 161),
          categoriesCompleted: Number(checkpointData.progress.categoriesCompleted || 0),
          totalVideosScraped: totalVideos,
          totalVideosFailed: Number(checkpointData.progress.totalVideosFailed || 0),
          startedAt: startedAt,
          videosPerSecond: elapsedSeconds > 0 ? Math.round((totalVideos / elapsedSeconds) * 10) / 10 : 0,
          pagesPerSecond: elapsedSeconds > 0 ? Math.round((pagesProcessed / elapsedSeconds) * 100) / 100 : 0
        }
        saveProgress(progress)
        return checkpointData.progress.status
      }
    } catch (error) {
      console.error('Failed to fetch checkpoint progress:', error)
    }
    return null
  }

  // Main scraper function (uses crash-recovery)
  const startScraping = async (resumeFromCheckpoint?: string) => {
    const resuming = !!resumeFromCheckpoint
    if (!resuming && !confirm(`Start scraping ${pagesPerCategory} pages from each category?`)) return

    setScraping(true)
    setMessage(resuming ? '🔄 Resuming scraper...' : '🚀 Starting scraper with crash recovery...')

    // Initialize progress with primitive values only
    const startTime = resuming ? String(savedProgress?.startedAt || new Date().toISOString()) : new Date().toISOString()
    const initialProgress = {
      checkpointId: String(resumeFromCheckpoint || ''),
      pagesPerCategory: Number(pagesPerCategory),
      totalCategories: 0,
      categoriesCompleted: 0,
      totalVideosScraped: 0,
      totalVideosFailed: 0,
      startedAt: startTime
    }
    saveProgress(initialProgress)

    // Track checkpoint ID for polling using ref so interval can access latest value
    checkpointIdRef.current = String(resumeFromCheckpoint || '')

    // Start polling for progress updates
    const pollInterval = setInterval(async () => {
      if (checkpointIdRef.current) {
        const status = await fetchCheckpointProgress(checkpointIdRef.current)
        if (status === 'completed' || status === 'failed') {
          clearInterval(pollInterval)
        }
      }
    }, 2000)

    try {
      const res = await fetch('/api/scraper/categories-with-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagesPerCategory,
          resumeCheckpointId: resumeFromCheckpoint || checkpointId || undefined
        })
      })

      const data = await res.json()

      if (!data.success) {
        clearInterval(pollInterval)
        setMessage(`❌ ${data.message}`)
        setScraping(false)
        return
      }

      // Update checkpoint ID ref so polling can track progress
      if (data.checkpointId) {
        checkpointIdRef.current = String(data.checkpointId)
        setCheckpointId(data.checkpointId)

        // Update saved progress with the checkpoint ID
        saveProgress({
          checkpointId: String(data.checkpointId),
          pagesPerCategory: Number(pagesPerCategory),
          totalCategories: 0,
          categoriesCompleted: 0,
          totalVideosScraped: 0,
          totalVideosFailed: 0,
          startedAt: startTime
        })

        setMessage(`🚀 Scraping in background... (${data.checkpointId})`)
      }

      // If async, don't stop - let polling detect completion
      // The interval will auto-stop when status is 'completed' or 'failed'
    } catch (error) {
      clearInterval(pollInterval)
      setMessage(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setScraping(false)
      checkpointIdRef.current = ''
    }
  }

  // Retry failed translations
  const retryTranslations = async () => {
    if (!retryStats || retryStats.total === 0) {
      setMessage('No videos need translation retry')
      return
    }

    setMessage('🔄 Retrying translations...')

    try {
      const res = await fetch(`/api/scraper/retry-translations?limit=${retryLimit}`, {
        method: 'POST'
      })
      const data = await res.json()

      if (data.success) {
        setMessage(`✅ ${data.successful} succeeded, ${data.failed} failed`)
        await fetchRetryStats()
        await fetchStats()
      } else {
        setMessage(`❌ ${data.message}`)
      }
    } catch (error) {
      setMessage(`❌ ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Clear all videos
  const clearVideos = async () => {
    if (!confirm('⚠️ Delete ALL videos? This cannot be undone!')) return

    try {
      const res = await fetch('/api/scraper/videos', { method: 'DELETE' })
      const data = await res.json()

      if (data.success) {
        setMessage(`✅ Deleted ${data.deleted} videos`)
        await fetchStats()
      }
    } catch (error) {
      setMessage(`❌ Failed to delete videos`)
    }
  }

  // Clean up Unknown category videos
  const cleanupUnknown = async () => {
    setMessage('🔍 Checking for Unknown category videos...')

    try {
      // First check how many exist
      const checkRes = await fetch('/api/scraper/cleanup-unknown')
      const checkData = await checkRes.json()

      if (!checkData.success || checkData.totalUnknownVideos === 0) {
        setMessage('✅ No Unknown category videos found')
        return
      }

      if (!confirm(`⚠️ Found ${checkData.totalUnknownVideos} videos with "Unknown" category.\nDelete them? These are corrupted entries from before the fix was deployed.`)) {
        return
      }

      // Delete them
      const deleteRes = await fetch('/api/scraper/cleanup-unknown', {
        method: 'POST'
      })
      const deleteData = await deleteRes.json()

      if (deleteData.success) {
        setMessage(`✅ Cleaned up ${deleteData.deleted} Unknown category videos`)
        await fetchStats()
      } else {
        setMessage(`❌ ${deleteData.message}`)
      }
    } catch (error) {
      setMessage(`❌ Failed to cleanup Unknown videos`)
    }
  }

  // Clear cache
  const clearCache = async () => {
    try {
      const res = await fetch('/api/admin/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      const data = await res.json()
      if (res.ok) {
        setMessage(`✅ ${data.message}`)
      } else {
        setMessage(`❌ ${data.message}`)
      }
    } catch (error) {
      setMessage(`❌ Failed to clear cache`)
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header Section */}
      <div className="border-b border-border/50 bg-gradient-to-r from-primary/5 to-accent/5 backdrop-blur-sm">
        <div className="py-12 px-6">
          <div className="space-y-2">
            <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Admin Dashboard
            </h1>
            <p className="text-lg text-muted-foreground font-medium">Manage your video scraper and database</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="py-8">
        <div className="space-y-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="relative group bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-2xl p-8 overflow-hidden hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Videos</p>
                  <p className="text-4xl font-bold text-primary">{stats?.totalVideos.toLocaleString() || 0}</p>
                </div>
                <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <Database className="w-8 h-8 text-primary" />
                </div>
              </div>
            </div>

            <div className="relative group bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-2xl p-8 overflow-hidden hover:border-accent/30 transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/5 to-accent/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Categories</p>
                  <p className="text-4xl font-bold text-accent">{stats?.categories.length || 0}</p>
                </div>
                <div className="p-3 rounded-xl bg-accent/10 group-hover:bg-accent/20 transition-colors">
                  <PlayCircle className="w-8 h-8 text-accent" />
                </div>
              </div>
            </div>

            <div className="relative group bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-2xl p-8 overflow-hidden hover:border-orange-500/30 transition-all duration-300 shadow-sm hover:shadow-lg hover:-translate-y-1">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/5 to-orange-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Need Translation</p>
                  <p className="text-4xl font-bold text-orange-500">{retryStats?.total || 0}</p>
                </div>
                <div className="p-3 rounded-xl bg-orange-500/10 group-hover:bg-orange-500/20 transition-colors">
                  <Languages className="w-8 h-8 text-orange-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Main Actions */}
          <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-2xl p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-foreground mb-8">Quick Actions</h2>

            {/* Resume Operation Banner */}
            {savedProgress && !scraping && (
              <div className="mb-8 relative group bg-gradient-to-r from-blue-600/10 to-blue-600/5 border border-blue-500/30 rounded-2xl p-6 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/0 via-blue-600/5 to-blue-600/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative flex items-center justify-between">
                  <div className="flex-1 space-y-1">
                    <h3 className="text-lg font-semibold text-blue-500">✨ Saved Progress Found</h3>
                    <p className="text-sm text-muted-foreground">
                      {savedProgress.categoriesCompleted}/{savedProgress.totalCategories} categories completed · {savedProgress.totalVideosScraped.toLocaleString()} videos scraped
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Started: {new Date(savedProgress.startedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-3 ml-6">
                    <button
                      onClick={() => startScraping(savedProgress.checkpointId)}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all duration-200 font-semibold text-sm hover:shadow-lg hover:scale-105 whitespace-nowrap"
                    >
                      Resume Operation
                    </button>
                    <button
                      onClick={clearProgress}
                      className="px-4 py-2.5 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-all duration-200 font-semibold text-sm hover:shadow-md whitespace-nowrap"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            )}

              {/* Primary Action: Start Scraping */}
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                    Pages per Category
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={pagesPerCategory}
                    onChange={(e) => setPagesPerCategory(parseInt(e.target.value) || 5)}
                    disabled={scraping}
                    className="w-full px-5 py-3 border border-border/50 bg-input text-foreground rounded-xl focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50 transition-colors hover:border-primary/50"
                  />
                </div>
                <button
                  onClick={() => startScraping()}
                  disabled={scraping}
                  className="px-8 py-3 bg-gradient-to-r from-primary via-accent to-primary text-primary-foreground rounded-xl font-semibold hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 whitespace-nowrap"
                >
                  {scraping ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Scraping...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <PlayCircle className="w-5 h-5" />
                      Start Scraping
                    </span>
                  )}
                </button>
              </div>

              {/* Advanced Options Toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm font-semibold text-muted-foreground hover:text-primary flex items-center gap-2 transition-colors uppercase tracking-wider"
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Advanced Options
              </button>

              {showAdvanced && (
                <div className="bg-muted/30 border border-border/50 rounded-xl p-6 space-y-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Resume from Checkpoint (optional)
                  </label>
                  <input
                    type="text"
                    value={checkpointId}
                    onChange={(e) => setCheckpointId(e.target.value)}
                    placeholder="scrape_xxx_xxx"
                    className="w-full px-4 py-2 border border-border bg-input text-foreground rounded-lg"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave empty to start fresh. Enter checkpoint ID to resume after crash.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Secondary Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-6 border-t border-border">
            <button
              onClick={retryTranslations}
              disabled={!retryStats || retryStats.total === 0}
              className="px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
            >
              <Languages className="w-5 h-5" />
              Retry Translations ({retryStats?.total || 0})
            </button>

            <button
              onClick={cleanupUnknown}
              className="px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-all font-medium flex items-center justify-center gap-2"
            >
              <Database className="w-5 h-5" />
              Clean Unknown
            </button>

            <button
              onClick={clearCache}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              Clear Cache
            </button>

            <button
              onClick={clearVideos}
              className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-medium flex items-center justify-center gap-2"
            >
              <Trash2 className="w-5 h-5" />
              Clear All Videos
            </button>
          </div>
        </div>

        {/* Real-time Progress Display */}
        {currentProgress && scraping && (
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-foreground">Scraping in Progress</h3>
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Live</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div className="bg-card/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Categories Progress</p>
                <p className="text-2xl font-bold text-primary">
                  {currentProgress.categoriesCompleted}/{currentProgress.totalCategories}
                </p>
                {currentProgress.totalCategories > 0 && (
                  <div className="mt-2 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all duration-500"
                      style={{ width: `${(currentProgress.categoriesCompleted / currentProgress.totalCategories) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="bg-card/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Videos Scraped</p>
                <p className="text-2xl font-bold text-green-600">
                  {currentProgress.totalVideosScraped.toLocaleString()}
                </p>
                {currentProgress.videosPerSecond && (
                  <p className="text-xs text-green-500 mt-1">{currentProgress.videosPerSecond} videos/sec</p>
                )}
              </div>

              <div className="bg-card/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Failed</p>
                <p className="text-2xl font-bold text-red-600">
                  {currentProgress.totalVideosFailed.toLocaleString()}
                </p>
              </div>

              <div className="bg-card/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Pages/Second</p>
                <p className="text-2xl font-bold text-blue-600">
                  {currentProgress.pagesPerSecond?.toFixed(2) || '0.00'}
                </p>
              </div>

              <div className="bg-card/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Elapsed Time</p>
                <p className="text-xl font-bold text-foreground">
                  {Math.floor((Date.now() - new Date(currentProgress.startedAt).getTime()) / 1000 / 60)}m {Math.floor(((Date.now() - new Date(currentProgress.startedAt).getTime()) / 1000) % 60)}s
                </p>
              </div>

              <div className="bg-card/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Est. Time Remaining</p>
                <p className="text-xl font-bold text-foreground">
                  {currentProgress.pagesPerSecond && currentProgress.pagesPerSecond > 0
                    ? (() => {
                        const remainingPages = (currentProgress.totalCategories - currentProgress.categoriesCompleted) * currentProgress.pagesPerCategory
                        const secondsRemaining = remainingPages / currentProgress.pagesPerSecond
                        const hours = Math.floor(secondsRemaining / 3600)
                        const mins = Math.floor((secondsRemaining % 3600) / 60)
                        return `${hours}h ${mins}m`
                      })()
                    : 'Calculating...'}
                </p>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>Started: {new Date(currentProgress.startedAt).toLocaleString()}</p>
              <p className="mt-1">Pages per category: {currentProgress.pagesPerCategory}</p>
            </div>
          </div>
        )}

        {/* Message Display */}
        {message && (
          <div className={`rounded-lg p-4 shadow-lg ${
            message.includes('✅')
              ? 'bg-green-500/10 text-green-600 border border-green-500/20'
              : message.includes('❌')
              ? 'bg-red-500/10 text-red-600 border border-red-500/20'
              : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
          }`}>
            <p className="font-medium">{message}</p>
          </div>
        )}

        {/* Category Breakdown */}
        {stats && stats.categories.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
            <h3 className="text-xl font-bold text-foreground mb-4">Category Breakdown</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {stats.categories.map((cat, idx) => (
                <div key={`${cat.typeId}-${cat.typeName}-${idx}`} className="bg-muted/50 rounded-lg p-3 border border-border">
                  <p className="text-sm font-medium text-foreground truncate">{cat.typeName}</p>
                  <p className="text-2xl font-bold text-primary">{cat._count.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
