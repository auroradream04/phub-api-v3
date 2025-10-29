'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { PlayCircle, RefreshCw, Trash2, Database, Languages, ChevronDown, ChevronUp } from 'lucide-react'

interface Stats {
  totalVideos: number
  categories: Array<{ typeId: number; typeName: string; _count: number }>
}

interface RetryStats {
  total: number
  byRetryCount: Array<{ retries: number; count: number }>
}

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

  // Main scraper function (uses crash-recovery)
  const startScraping = async () => {
    if (!confirm(`Start scraping ${pagesPerCategory} pages from each category?`)) return

    setScraping(true)
    setMessage('🚀 Starting scraper with crash recovery...')

    try {
      const res = await fetch('/api/scraper/categories-with-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pagesPerCategory,
          checkpointId: checkpointId || undefined
        })
      })

      const data = await res.json()

      if (data.success) {
        setMessage(`✅ Scraping complete! ${data.totalScraped || 0} videos scraped`)
        setCheckpointId(data.checkpointId || '')
        await fetchStats()
        await fetchRetryStats()
      } else {
        setMessage(`❌ ${data.message}`)
      }
    } catch (error) {
      setMessage(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setScraping(false)
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
                onClick={startScraping}
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
