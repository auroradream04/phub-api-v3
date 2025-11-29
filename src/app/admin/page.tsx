'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import {
  PlayCircle,
  RefreshCw,
  Trash2,
  Database,
  ChevronDown,
  ChevronUp,
  Grid,
  Eye,
  Check,
  Search,
  Folder,
  Video,
  Zap
} from 'lucide-react'
import { CONSOLIDATED_CATEGORIES, CONSOLIDATED_TO_CHINESE, getVariantsForConsolidated } from '@/lib/maccms-mappings'
import { ThumbnailMigration } from '@/components/admin/thumbnail-migration'

interface Stats {
  totalVideos: number
  categories: Array<{ typeId: number; typeName: string; _count: number }>
}

interface ScraperProgress {
  checkpointId: string
  pagesPerCategory: number
  totalCategories: number
  categoriesCompleted: number
  totalVideosScraped: number
  totalVideosFailed: number
  newVideosAdded?: number
  currentCategory?: string
  currentPage?: number
  startedAt: string
  videosPerSecond?: number
  pagesPerSecond?: number
}

interface MaccmsVideo {
  vod_id: string
  vod_name: string
  vod_pic?: string
  vod_hits?: number
  type_name?: string
}

interface KeywordJob {
  jobId: string
  status: string
  totalScraped: number
  totalDuplicates: number
  totalErrors: number
  currentKeyword: string
  keywordsCompleted: number
  totalKeywords: number
  currentPage: number
  pagesPerKeyword: number
}

const STORAGE_KEY = 'scraper_progress'

export default function AdminDashboard() {
  const { data: session } = useSession()

  // Core states
  const [scraping, setScraping] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [message, setMessage] = useState('')
  const [pagesPerCategory, setPagesPerCategory] = useState(5)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [savedProgress, setSavedProgress] = useState<ScraperProgress | null>(null)
  const [currentProgress, setCurrentProgress] = useState<ScraperProgress | null>(null)
  const checkpointIdRef = useRef<string>('')

  // Category filtering
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set())
  const [availableCategories, setAvailableCategories] = useState<Array<{id: number; name: string; isCustom: boolean}>>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [categoriesSearchQuery, setCategoriesSearchQuery] = useState('')

  // Category browser
  const [categoryTab, setCategoryTab] = useState<'database' | 'consolidated'>('database')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedConsolidated, setSelectedConsolidated] = useState<{ name: string; variants: string[] } | null>(null)
  const [categoryVideos, setCategoryVideos] = useState<MaccmsVideo[]>([])
  const [loadingCategoryVideos, setLoadingCategoryVideos] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<'videos' | 'variants'>('videos')
  const [videoPage, setVideoPage] = useState(1)
  const [categorySearchQuery, setCategorySearchQuery] = useState('')

  // Global search
  const [globalVideoSearchQuery, setGlobalVideoSearchQuery] = useState('')
  const [globalSearchResults, setGlobalSearchResults] = useState<MaccmsVideo[]>([])
  const [loadingGlobalSearch, setLoadingGlobalSearch] = useState(false)
  const [globalSearchPage, setGlobalSearchPage] = useState(1)
  const [globalSearchTotalCount, setGlobalSearchTotalCount] = useState(0)
  const [globalLoadingPage, setGlobalLoadingPage] = useState(false)
  const [selectedSearchVideoIds, setSelectedSearchVideoIds] = useState<Set<string>>(new Set())
  const [deletingAllSearch, setDeletingAllSearch] = useState(false)

  // Keyword scraper
  const [keywordScrapingJapanese, setKeywordScrapingJapanese] = useState(false)
  const [keywordScrapingChinese, setKeywordScrapingChinese] = useState(false)
  const [keywordJobJapanese, setKeywordJobJapanese] = useState<KeywordJob | null>(null)
  const [keywordJobChinese, setKeywordJobChinese] = useState<KeywordJob | null>(null)
  const [keywordPagesPerKeyword, setKeywordPagesPerKeyword] = useState(3)

  const videosPerPage = 12

  useEffect(() => {
    fetchStats()
    fetchCategories()
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setSavedProgress(JSON.parse(saved))
      } catch { /* ignore */ }
    }
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/provide/vod?ac=detail&pg=1&limit=1')
      const data = await res.json()
      if (data.class) {
        const categories = data.class.map((cat: { type_id: number; type_name: string }) => ({
          typeId: cat.type_id,
          typeName: cat.type_name,
          _count: 0
        }))
        setStats({ totalVideos: data.total || 0, categories })
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const fetchCategories = async () => {
    setLoadingCategories(true)
    try {
      const res = await fetch('/api/categories')
      const data = await res.json()
      setAvailableCategories(data.categories || [])
    } catch (error) {
      console.error('Failed to fetch categories:', error)
    } finally {
      setLoadingCategories(false)
    }
  }

  const saveProgress = (progress: ScraperProgress) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
      setCurrentProgress(progress)
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
        fetch('/api/categories')
      ])
      const checkpointData = await checkpointRes.json()
      const categoriesData = await categoriesRes.json()

      if (checkpointData.success && checkpointData.progress) {
        const startedAt = checkpointData.checkpoint?.startedAt || currentProgress?.startedAt || new Date().toISOString()
        const elapsedSeconds = (Date.now() - new Date(startedAt).getTime()) / 1000
        const totalVideos = checkpointData.progress.totalVideosScraped || 0
        const pagesProcessed = checkpointData.progress.categoriesCompleted * pagesPerCategory
        const videoCountAtStart = checkpointData.checkpoint?.videoCountAtStart || 0
        const videoCountCurrent = checkpointData.checkpoint?.videoCountCurrent || videoCountAtStart + totalVideos
        const newVideosAdded = Math.max(0, videoCountCurrent - videoCountAtStart)

        const progress: ScraperProgress = {
          checkpointId: String(id),
          pagesPerCategory: Number(pagesPerCategory),
          totalCategories: Number(checkpointData.progress.categoriesTotal || categoriesData.total || 165),
          categoriesCompleted: Number(checkpointData.progress.categoriesCompleted || 0),
          totalVideosScraped: totalVideos,
          totalVideosFailed: Number(checkpointData.progress.totalVideosFailed || 0),
          newVideosAdded,
          startedAt,
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

  const startScraping = async (resumeId?: string) => {
    setScraping(true)
    setMessage('Starting scraper...')

    try {
      const body: Record<string, unknown> = { pagesPerCategory }
      if (resumeId) body.resumeCheckpointId = resumeId
      if (selectedCategoryIds.size > 0) body.categoryIds = Array.from(selectedCategoryIds)

      const res = await fetch('/api/scraper/categories-with-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()

      if (data.success) {
        const newCheckpointId = data.checkpointId
        checkpointIdRef.current = newCheckpointId
        setMessage(`Scraping started (checkpoint: ${newCheckpointId})`)

        const pollInterval = setInterval(async () => {
          const status = await fetchCheckpointProgress(checkpointIdRef.current)
          if (status === 'completed' || status === 'failed') {
            clearInterval(pollInterval)
            setScraping(false)
            setMessage(status === 'completed' ? '✓ Scraping completed!' : '✗ Scraping failed')
            fetchStats()
          }
        }, 3000)
      } else {
        setMessage(`✗ Failed: ${data.message}`)
        setScraping(false)
      }
    } catch (error) {
      setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setScraping(false)
    }
  }

  const startKeywordScraping = async (category: 'japanese' | 'chinese') => {
    const setLoading = category === 'japanese' ? setKeywordScrapingJapanese : setKeywordScrapingChinese
    const setJob = category === 'japanese' ? setKeywordJobJapanese : setKeywordJobChinese

    if (!confirm(`Start keyword search scraping for ${category}?`)) return

    setLoading(true)
    setMessage(`Starting keyword search for ${category}...`)

    try {
      const res = await fetch('/api/scraper/keyword-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, pagesPerKeyword: keywordPagesPerKeyword })
      })
      const data = await res.json()

      if (data.success) {
        setMessage(`✓ Started keyword search for ${category}`)

        const pollInterval = setInterval(async () => {
          const statusRes = await fetch(`/api/scraper/keyword-search?jobId=${data.jobId}`)
          const statusData = await statusRes.json()

          if (statusData.success) {
            setJob(statusData.job)
            if (statusData.job.status === 'completed' || statusData.job.status === 'failed') {
              clearInterval(pollInterval)
              setLoading(false)
              setMessage(`✓ ${category} keyword search ${statusData.job.status}`)
              fetchStats()
            }
          }
        }, 2000)
      } else {
        setMessage(`✗ Failed: ${data.message}`)
        setLoading(false)
      }
    } catch (error) {
      setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setLoading(false)
    }
  }

  const handleSelectCategory = async (category: { typeId: number; typeName: string }) => {
    setSelectedCategory(category.typeName)
    setSelectedConsolidated(null)
    setVideoPage(1)
    setLoadingCategoryVideos(true)
    try {
      const res = await fetch(`/api/admin/videos/by-category?typeId=${category.typeId}&page=1`)
      const data = await res.json()
      setCategoryVideos(data.list || [])
    } catch (error) {
      console.error('Failed to fetch videos:', error)
      setCategoryVideos([])
    } finally {
      setLoadingCategoryVideos(false)
    }
  }

  const handleSelectConsolidatedCategory = async (consolidated: string) => {
    const capitalizedName = consolidated.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    setSelectedCategory(`${capitalizedName} (${CONSOLIDATED_TO_CHINESE[consolidated]})`)
    const variants = getVariantsForConsolidated(consolidated)
    setSelectedConsolidated({ name: consolidated, variants })
    setVideoPage(1)
    setRightPanelTab('videos')
    setLoadingCategoryVideos(true)
    try {
      const variantParams = variants.map(v => `variants=${encodeURIComponent(v)}`).join('&')
      const res = await fetch(`/api/admin/videos/by-category?${variantParams}&page=1`)
      const data = await res.json()
      setCategoryVideos(data.list || [])
    } catch (error) {
      console.error('Failed to fetch videos:', error)
      setCategoryVideos([])
    } finally {
      setLoadingCategoryVideos(false)
    }
  }

  const handleGlobalSearch = async (query: string, page = 1) => {
    if (!query.trim()) {
      setGlobalSearchResults([])
      setGlobalSearchTotalCount(0)
      return
    }

    if (page === 1) setLoadingGlobalSearch(true)
    else setGlobalLoadingPage(true)

    try {
      const res = await fetch(`/api/provide/vod?ac=detail&wd=${encodeURIComponent(query)}&pg=${page}`)
      const data = await res.json()
      const videos = (data.list || []).map((v: { vod_id: string; vod_name: string; vod_pic: string; vod_hits: number; type_name: string }) => ({
        vod_id: v.vod_id,
        vod_name: v.vod_name,
        vod_pic: v.vod_pic,
        vod_hits: v.vod_hits,
        type_name: v.type_name
      }))

      if (page === 1) {
        setGlobalSearchResults(videos)
        setGlobalSearchTotalCount(data.total || 0)
      } else {
        setGlobalSearchResults(prev => [...prev, ...videos])
      }
      setGlobalSearchPage(page)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setLoadingGlobalSearch(false)
      setGlobalLoadingPage(false)
    }
  }

  const handleDeleteVideo = async (vodId: string) => {
    if (!confirm('Delete this video?')) return

    try {
      const res = await fetch(`/api/admin/videos/${vodId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setCategoryVideos(prev => prev.filter(v => v.vod_id !== vodId))
        setGlobalSearchResults(prev => prev.filter(v => v.vod_id !== vodId))
        setMessage('✓ Video deleted')
        fetchStats()
      } else {
        setMessage(`✗ Delete failed: ${data.message}`)
      }
    } catch (error) {
      setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown'}`)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedSearchVideoIds.size === 0) return
    if (!confirm(`Delete ${selectedSearchVideoIds.size} videos?`)) return

    setDeletingAllSearch(true)
    try {
      const res = await fetch('/api/admin/videos/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vodIds: Array.from(selectedSearchVideoIds) })
      })
      const data = await res.json()
      if (data.success) {
        setGlobalSearchResults(prev => prev.filter(v => !selectedSearchVideoIds.has(v.vod_id)))
        setSelectedSearchVideoIds(new Set())
        setMessage(`✓ Deleted ${data.deleted} videos`)
        fetchStats()
      }
    } catch (error) {
      setMessage(`✗ Error: ${error instanceof Error ? error.message : 'Unknown'}`)
    } finally {
      setDeletingAllSearch(false)
    }
  }

  const filteredCategories = stats?.categories.filter(cat =>
    cat.typeName.toLowerCase().includes(categorySearchQuery.toLowerCase())
  ) || []

  const filteredAvailableCategories = availableCategories.filter(cat =>
    cat.name.toLowerCase().includes(categoriesSearchQuery.toLowerCase())
  )

  const filteredConsolidated = Object.entries(CONSOLIDATED_CATEGORIES).filter(([name]) =>
    name.toLowerCase().includes(categorySearchQuery.toLowerCase())
  )

  const paginatedVideos = categoryVideos.slice((videoPage - 1) * videosPerPage, videoPage * videosPerPage)
  const totalPages = Math.ceil(categoryVideos.length / videosPerPage)

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Please sign in to access the admin dashboard.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="border-b border-border/50 bg-gradient-to-r from-primary/5 to-accent/5">
        <div className="max-w-7xl mx-auto py-8 px-6">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">Manage videos, scraping, and content</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<Database className="w-6 h-6" />}
            label="Total Videos"
            value={stats?.totalVideos.toLocaleString() || '0'}
            color="primary"
          />
          <StatCard
            icon={<Folder className="w-6 h-6" />}
            label="Categories"
            value={String(stats?.categories.length || 0)}
            color="accent"
          />
          <StatCard
            icon={<Video className="w-6 h-6" />}
            label="Scraped This Session"
            value={currentProgress?.newVideosAdded?.toLocaleString() || '0'}
            color="emerald"
          />
          <StatCard
            icon={<Zap className="w-6 h-6" />}
            label="Speed"
            value={currentProgress?.videosPerSecond ? `${currentProgress.videosPerSecond}/s` : '-'}
            color="orange"
          />
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`p-4 rounded-xl ${
            message.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' :
            message.startsWith('✗') ? 'bg-red-500/10 text-red-700 border border-red-500/20' :
            'bg-blue-500/10 text-blue-700 border border-blue-500/20'
          }`}>
            {message}
          </div>
        )}

        {/* Resume Banner */}
        {savedProgress && !scraping && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-blue-700">Saved Progress Found</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {savedProgress.categoriesCompleted}/{savedProgress.totalCategories} categories · {savedProgress.totalVideosScraped.toLocaleString()} videos
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => startScraping(savedProgress.checkpointId)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Resume
                </button>
                <button
                  onClick={clearProgress}
                  className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scraper Progress */}
        {scraping && currentProgress && (
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                Scraping in Progress
              </h3>
              <span className="text-sm text-muted-foreground">
                {currentProgress.categoriesCompleted}/{currentProgress.totalCategories} categories
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${(currentProgress.categoriesCompleted / currentProgress.totalCategories) * 100}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
              <div>
                <span className="text-muted-foreground">Videos:</span>{' '}
                <span className="font-medium">{currentProgress.totalVideosScraped.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">New:</span>{' '}
                <span className="font-medium text-emerald-600">{currentProgress.newVideosAdded?.toLocaleString() || 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Speed:</span>{' '}
                <span className="font-medium">{currentProgress.videosPerSecond}/s</span>
              </div>
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Scraper Controls */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-primary" />
              Category Scraper
            </h2>

            <div className="mb-6">
              <label className="text-sm text-muted-foreground mb-2 block">Pages per Category</label>
              <div className="flex items-center gap-2">
                {[3, 5, 10, 20].map(n => (
                  <button
                    key={n}
                    onClick={() => setPagesPerCategory(n)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      pagesPerCategory === n
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Filter Categories
            </button>

            {showAdvanced && (
              <div className="mb-6 p-4 bg-muted/30 rounded-lg">
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={categoriesSearchQuery}
                  onChange={e => setCategoriesSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg mb-3"
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {filteredAvailableCategories.map(cat => (
                    <label key={cat.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCategoryIds.has(cat.id)}
                        onChange={e => {
                          const newSet = new Set(selectedCategoryIds)
                          if (e.target.checked) newSet.add(cat.id)
                          else newSet.delete(cat.id)
                          setSelectedCategoryIds(newSet)
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">{cat.name}</span>
                      {cat.isCustom && <span className="text-xs text-primary">(custom)</span>}
                    </label>
                  ))}
                </div>
                {selectedCategoryIds.size > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">{selectedCategoryIds.size} selected</p>
                )}
              </div>
            )}

            <button
              onClick={() => startScraping()}
              disabled={scraping}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {scraping ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <PlayCircle className="w-5 h-5" />
                  Start Scraping
                </>
              )}
            </button>
          </div>

          {/* Keyword Scraper */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-accent" />
              Keyword Scraper
            </h2>

            <div className="mb-6">
              <label className="text-sm text-muted-foreground mb-2 block">Pages per Keyword</label>
              <div className="flex items-center gap-2">
                {[1, 3, 5, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => setKeywordPagesPerKeyword(n)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      keywordPagesPerKeyword === n
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <button
                  onClick={() => startKeywordScraping('japanese')}
                  disabled={keywordScrapingJapanese}
                  className="w-full py-3 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 disabled:opacity-50"
                >
                  {keywordScrapingJapanese ? 'Scraping...' : 'Japanese'}
                </button>
                {keywordJobJapanese && (
                  <p className="text-xs text-center mt-2 text-muted-foreground">
                    {keywordJobJapanese.keywordsCompleted}/{keywordJobJapanese.totalKeywords} · {keywordJobJapanese.totalScraped} videos
                  </p>
                )}
              </div>
              <div>
                <button
                  onClick={() => startKeywordScraping('chinese')}
                  disabled={keywordScrapingChinese}
                  className="w-full py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-50"
                >
                  {keywordScrapingChinese ? 'Scraping...' : 'Chinese'}
                </button>
                {keywordJobChinese && (
                  <p className="text-xs text-center mt-2 text-muted-foreground">
                    {keywordJobChinese.keywordsCompleted}/{keywordJobChinese.totalKeywords} · {keywordJobChinese.totalScraped} videos
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Thumbnail Migration */}
        <ThumbnailMigration />

        {/* Category Browser */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Grid className="w-5 h-5 text-primary" />
              Category Browser
            </h2>
          </div>

          {/* Global Search */}
          <div className="p-4 border-b border-border bg-muted/30">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search all videos..."
                  value={globalVideoSearchQuery}
                  onChange={e => setGlobalVideoSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGlobalSearch(globalVideoSearchQuery)}
                  className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg"
                />
              </div>
              <button
                onClick={() => handleGlobalSearch(globalVideoSearchQuery)}
                disabled={loadingGlobalSearch}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {loadingGlobalSearch ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 min-h-[500px]">
            {/* Categories List */}
            <div className="border-r border-border">
              <div className="p-3 border-b border-border">
                <div className="flex gap-2">
                  <button
                    onClick={() => setCategoryTab('database')}
                    className={`flex-1 py-2 text-sm rounded-lg ${
                      categoryTab === 'database' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    Database
                  </button>
                  <button
                    onClick={() => setCategoryTab('consolidated')}
                    className={`flex-1 py-2 text-sm rounded-lg ${
                      categoryTab === 'consolidated' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    Consolidated
                  </button>
                </div>
              </div>

              <div className="p-3">
                <input
                  type="text"
                  placeholder="Filter..."
                  value={categorySearchQuery}
                  onChange={e => setCategorySearchQuery(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm"
                />
              </div>

              <div className="max-h-[400px] overflow-y-auto">
                {categoryTab === 'database' ? (
                  filteredCategories.map(cat => (
                    <button
                      key={cat.typeId}
                      onClick={() => handleSelectCategory(cat)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted border-b border-border/50 ${
                        selectedCategory === cat.typeName ? 'bg-primary/10' : ''
                      }`}
                    >
                      <span className="font-medium">{cat.typeName}</span>
                    </button>
                  ))
                ) : (
                  filteredConsolidated.map(([name]) => (
                    <button
                      key={name}
                      onClick={() => handleSelectConsolidatedCategory(name)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted border-b border-border/50 ${
                        selectedConsolidated?.name === name ? 'bg-primary/10' : ''
                      }`}
                    >
                      <span className="font-medium capitalize">{name.replace(/-/g, ' ')}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {CONSOLIDATED_TO_CHINESE[name]}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Videos Grid */}
            <div className="md:col-span-2 p-4">
              {globalSearchResults.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">Search Results ({globalSearchTotalCount.toLocaleString()})</h3>
                    {selectedSearchVideoIds.size > 0 && (
                      <button
                        onClick={handleBulkDelete}
                        disabled={deletingAllSearch}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete ({selectedSearchVideoIds.size})
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {globalSearchResults.map(video => (
                      <VideoCard
                        key={video.vod_id}
                        video={video}
                        selected={selectedSearchVideoIds.has(video.vod_id)}
                        onSelect={() => {
                          const newSet = new Set(selectedSearchVideoIds)
                          if (newSet.has(video.vod_id)) newSet.delete(video.vod_id)
                          else newSet.add(video.vod_id)
                          setSelectedSearchVideoIds(newSet)
                        }}
                        onDelete={() => handleDeleteVideo(video.vod_id)}
                      />
                    ))}
                  </div>
                  {globalSearchTotalCount > globalSearchResults.length && (
                    <button
                      onClick={() => handleGlobalSearch(globalVideoSearchQuery, globalSearchPage + 1)}
                      disabled={globalLoadingPage}
                      className="w-full mt-4 py-2 bg-muted rounded-lg hover:bg-muted/80"
                    >
                      {globalLoadingPage ? 'Loading...' : 'Load More'}
                    </button>
                  )}
                </>
              ) : selectedCategory ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">{selectedCategory}</h3>
                    {selectedConsolidated && (
                      <button
                        onClick={() => setRightPanelTab(rightPanelTab === 'videos' ? 'variants' : 'videos')}
                        className="text-sm text-primary hover:underline"
                      >
                        {rightPanelTab === 'videos' ? 'Show Variants' : 'Show Videos'}
                      </button>
                    )}
                  </div>

                  {rightPanelTab === 'variants' && selectedConsolidated ? (
                    <div className="space-y-2">
                      {selectedConsolidated.variants.map(v => (
                        <div key={v} className="p-3 bg-muted rounded-lg text-sm">{v}</div>
                      ))}
                    </div>
                  ) : loadingCategoryVideos ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {paginatedVideos.map(video => (
                          <VideoCard key={video.vod_id} video={video} onDelete={() => handleDeleteVideo(video.vod_id)} />
                        ))}
                      </div>
                      {totalPages > 1 && (
                        <div className="flex justify-center gap-2 mt-4">
                          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                            <button
                              key={p}
                              onClick={() => setVideoPage(p)}
                              className={`w-8 h-8 rounded ${videoPage === p ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a category or search for videos
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colorClasses: Record<string, string> = {
    primary: 'text-primary bg-primary/10',
    accent: 'text-accent bg-accent/10',
    emerald: 'text-emerald-600 bg-emerald-500/10',
    orange: 'text-orange-600 bg-orange-500/10'
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        </div>
      </div>
    </div>
  )
}

function VideoCard({ video, selected, onSelect, onDelete }: {
  video: MaccmsVideo
  selected?: boolean
  onSelect?: () => void
  onDelete: () => void
}) {
  return (
    <div className={`group relative bg-muted rounded-lg overflow-hidden ${selected ? 'ring-2 ring-primary' : ''}`}>
      {video.vod_pic ? (
        <img src={video.vod_pic} alt={video.vod_name} className="w-full aspect-video object-cover" />
      ) : (
        <div className="w-full aspect-video bg-muted-foreground/20 flex items-center justify-center">
          <Video className="w-8 h-8 text-muted-foreground" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        {onSelect && (
          <button onClick={onSelect} className="p-2 bg-white/20 rounded-lg hover:bg-white/30">
            <Check className="w-4 h-4 text-white" />
          </button>
        )}
        <a href={`/watch/${video.vod_id}`} target="_blank" className="p-2 bg-white/20 rounded-lg hover:bg-white/30">
          <Eye className="w-4 h-4 text-white" />
        </a>
        <button onClick={onDelete} className="p-2 bg-red-500/80 rounded-lg hover:bg-red-600">
          <Trash2 className="w-4 h-4 text-white" />
        </button>
      </div>
      <div className="p-2">
        <p className="text-xs truncate">{video.vod_name}</p>
      </div>
    </div>
  )
}
