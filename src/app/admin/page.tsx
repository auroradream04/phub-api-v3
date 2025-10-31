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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">Manage your video scraper and database</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Videos</p>
                <p className="text-3xl font-bold text-primary">{stats?.totalVideos.toLocaleString() || 0}</p>
              </div>
              <Database className="w-12 h-12 text-primary/20" />
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Categories</p>
                <p className="text-3xl font-bold text-accent">{stats?.categories.length || 0}</p>
              </div>
              <PlayCircle className="w-12 h-12 text-accent/20" />
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Need Translation</p>
                <p className="text-3xl font-bold text-orange-500">{retryStats?.total || 0}</p>
              </div>
              <Languages className="w-12 h-12 text-orange-500/20" />
            </div>
          </div>
        </div>

        {/* Main Actions */}
        <div className="bg-card border border-border rounded-xl p-8 shadow-lg">
          <h2 className="text-2xl font-bold text-foreground mb-6">Quick Actions</h2>

          {/* Resume Operation Banner */}
          {savedProgress && !scraping && (
            <div className="mb-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-blue-600 mb-1">Saved Progress Found</h3>
                  <p className="text-sm text-muted-foreground">
                    {savedProgress.categoriesCompleted}/{savedProgress.totalCategories} categories completed ·
                    {' '}{savedProgress.totalVideosScraped.toLocaleString()} videos scraped
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Started: {new Date(savedProgress.startedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startScraping(savedProgress.checkpointId)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium"
                  >
                    Resume Operation
                  </button>
                  <button
                    onClick={clearProgress}
                    className="px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all font-medium"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Primary Action: Start Scraping */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Pages per Category
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={pagesPerCategory}
                  onChange={(e) => setPagesPerCategory(parseInt(e.target.value) || 5)}
                  disabled={scraping}
                  className="w-full px-4 py-3 border border-border bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50"
                />
              </div>
              <button
                onClick={() => startScraping()}
                disabled={scraping}
                className="mt-7 px-8 py-3 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-lg font-semibold hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Advanced Options
            </button>

            {showAdvanced && (
              <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-6 border-t border-border">
            <button
              onClick={retryTranslations}
              disabled={!retryStats || retryStats.total === 0}
              className="px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
            >
              <Languages className="w-5 h-5" />
              Retry Translations ({retryStats?.total || 0})
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
              {stats.categories.map(cat => (
                <div key={cat.typeId} className="bg-muted/50 rounded-lg p-3 border border-border">
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
