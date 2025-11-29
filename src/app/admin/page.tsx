'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Trash2, ChevronDown, Eye, Check, Search, Play, Square } from 'lucide-react'
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
  startedAt: string
  videosPerSecond?: number
}

interface MaccmsVideo {
  vod_id: string
  vod_name: string
  vod_pic?: string
  type_name?: string
}

interface KeywordJob {
  status: string
  totalScraped: number
  totalDuplicates?: number
  keywordsCompleted: number
  totalKeywords: number
}

const STORAGE_KEY = 'scraper_progress'

// Custom category IDs for keyword-based scraping
const JAPANESE_CATEGORY_ID = 9999
const CHINESE_CATEGORY_ID = 9998

// Tag-style toggle
function Tag({ selected, onClick, children }: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-sm transition-all ${
        selected
          ? 'bg-purple-600 text-white'
          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

export default function AdminDashboard() {
  const { data: session } = useSession()

  const [scraping, setScraping] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [message, setMessage] = useState('')
  const [pagesPerCategory, setPagesPerCategory] = useState(5)
  const [showCategoryFilter, setShowCategoryFilter] = useState(true) // Open by default
  const [savedProgress, setSavedProgress] = useState<ScraperProgress | null>(null)
  const [currentProgress, setCurrentProgress] = useState<ScraperProgress | null>(null)
  const checkpointIdRef = useRef<string>('')

  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set())
  const [availableCategories, setAvailableCategories] = useState<Array<{id: number; name: string; isCustom: boolean}>>([])

  const [categoryTab, setCategoryTab] = useState<'database' | 'consolidated'>('database')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedConsolidated, setSelectedConsolidated] = useState<{ name: string; variants: string[] } | null>(null)
  const [categoryVideos, setCategoryVideos] = useState<MaccmsVideo[]>([])
  const [loadingCategoryVideos, setLoadingCategoryVideos] = useState(false)
  const [videoPage, setVideoPage] = useState(1)
  const [categorySearchQuery, setCategorySearchQuery] = useState('')

  const [globalVideoSearchQuery, setGlobalVideoSearchQuery] = useState('')
  const [globalSearchResults, setGlobalSearchResults] = useState<MaccmsVideo[]>([])
  const [loadingGlobalSearch, setLoadingGlobalSearch] = useState(false)
  const [globalSearchPage, setGlobalSearchPage] = useState(1)
  const [globalSearchTotalCount, setGlobalSearchTotalCount] = useState(0)
  const [selectedSearchVideoIds, setSelectedSearchVideoIds] = useState<Set<string>>(new Set())

  // Keyword scraper state (for japanese/chinese)
  const [keywordJobs, setKeywordJobs] = useState<{
    japanese: { running: boolean; job: KeywordJob | null }
    chinese: { running: boolean; job: KeywordJob | null }
  }>({
    japanese: { running: false, job: null },
    chinese: { running: false, job: null }
  })

  const videosPerPage = 18

  useEffect(() => {
    fetchStats()
    fetchCategories()
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try { setSavedProgress(JSON.parse(saved)) } catch { /* ignore */ }
    }
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/provide/vod?ac=detail&pg=1&limit=1')
      const data = await res.json()
      if (data.class) {
        const categories = data.class.map((cat: { type_id: number; type_name: string }) => ({
          typeId: cat.type_id, typeName: cat.type_name, _count: 0
        }))
        setStats({ totalVideos: data.total || 0, categories })
      }
    } catch (e) { console.error(e) }
  }

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories')
      const data = await res.json()
      setAvailableCategories(data.categories || [])
    } catch (e) { console.error(e) }
  }

  const saveProgress = (progress: ScraperProgress) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
    setCurrentProgress(progress)
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
        const startedAt = checkpointData.checkpoint?.startedAt || new Date().toISOString()
        const elapsedSeconds = (Date.now() - new Date(startedAt).getTime()) / 1000
        const totalVideos = checkpointData.progress.totalVideosScraped || 0
        const videoCountAtStart = checkpointData.checkpoint?.videoCountAtStart || 0
        const videoCountCurrent = checkpointData.checkpoint?.videoCountCurrent || videoCountAtStart + totalVideos

        const progress: ScraperProgress = {
          checkpointId: String(id),
          pagesPerCategory: Number(pagesPerCategory),
          totalCategories: Number(checkpointData.progress.categoriesTotal || categoriesData.total || 165),
          categoriesCompleted: Number(checkpointData.progress.categoriesCompleted || 0),
          totalVideosScraped: totalVideos,
          totalVideosFailed: Number(checkpointData.progress.totalVideosFailed || 0),
          newVideosAdded: Math.max(0, videoCountCurrent - videoCountAtStart),
          startedAt,
          videosPerSecond: elapsedSeconds > 0 ? Math.round((totalVideos / elapsedSeconds) * 10) / 10 : 0
        }
        saveProgress(progress)
        return checkpointData.progress.status
      }
    } catch (e) { console.error(e) }
    return null
  }

  // Start keyword scraping for japanese or chinese
  const startKeywordScraping = async (category: 'japanese' | 'chinese') => {
    setKeywordJobs(prev => ({
      ...prev,
      [category]: { running: true, job: null }
    }))

    try {
      const res = await fetch('/api/scraper/keyword-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, pagesPerKeyword: pagesPerCategory })
      })
      const data = await res.json()

      if (data.success) {
        const pollInterval = setInterval(async () => {
          const statusRes = await fetch(`/api/scraper/keyword-search?jobId=${data.jobId}`)
          const statusData = await statusRes.json()
          if (statusData.success && statusData.job) {
            setKeywordJobs(prev => ({
              ...prev,
              [category]: { running: statusData.job.status === 'running', job: statusData.job }
            }))
            if (statusData.job.status === 'completed' || statusData.job.status === 'failed') {
              clearInterval(pollInterval)
              fetchStats()
            }
          }
        }, 2000)
      } else {
        setKeywordJobs(prev => ({
          ...prev,
          [category]: { running: false, job: null }
        }))
      }
    } catch {
      setKeywordJobs(prev => ({
        ...prev,
        [category]: { running: false, job: null }
      }))
    }
  }

  const startScraping = async (resumeId?: string) => {
    // Check if japanese or chinese categories are selected
    const hasJapanese = selectedCategoryIds.has(JAPANESE_CATEGORY_ID)
    const hasChinese = selectedCategoryIds.has(CHINESE_CATEGORY_ID)
    const regularCategoryIds = Array.from(selectedCategoryIds).filter(
      id => id !== JAPANESE_CATEGORY_ID && id !== CHINESE_CATEGORY_ID
    )

    // Start keyword scrapers for special categories
    if (hasJapanese && !keywordJobs.japanese.running) {
      startKeywordScraping('japanese')
    }
    if (hasChinese && !keywordJobs.chinese.running) {
      startKeywordScraping('chinese')
    }

    // Only start regular scraper if there are regular categories selected, or no filter (scrape all)
    const shouldScrapeRegular = regularCategoryIds.length > 0 || selectedCategoryIds.size === 0

    if (!shouldScrapeRegular) {
      // Only keyword categories selected, no regular scraping needed
      return
    }

    setScraping(true)
    setMessage('Starting...')

    try {
      const body: Record<string, unknown> = { pagesPerCategory }
      if (resumeId) body.resumeCheckpointId = resumeId
      if (regularCategoryIds.length > 0) body.categoryIds = regularCategoryIds

      const res = await fetch('/api/scraper/categories-with-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()

      if (data.success) {
        checkpointIdRef.current = data.checkpointId
        setMessage('')

        const pollInterval = setInterval(async () => {
          const status = await fetchCheckpointProgress(checkpointIdRef.current)
          if (status === 'completed' || status === 'failed') {
            clearInterval(pollInterval)
            setScraping(false)
            setMessage(status === 'completed' ? 'Completed' : 'Failed')
            fetchStats()
          }
        }, 3000)
      } else {
        setMessage(`Error: ${data.message}`)
        setScraping(false)
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Unknown'}`)
      setScraping(false)
    }
  }

  const handleSelectCategory = async (category: { typeId: number; typeName: string }) => {
    setSelectedCategory(category.typeName)
    setSelectedConsolidated(null)
    setVideoPage(1)
    setCategoryVideos([])
    setLoadingCategoryVideos(true)

    try {
      const res = await fetch(`/api/admin/videos/by-category?typeId=${category.typeId}&page=1`)
      const data = await res.json()
      setCategoryVideos(data.list || [])
    } catch (err) {
      console.error('Failed to fetch category videos:', err)
      setCategoryVideos([])
    } finally {
      setLoadingCategoryVideos(false)
    }
  }

  const handleSelectConsolidatedCategory = async (consolidated: string) => {
    setSelectedCategory(`${consolidated} (${CONSOLIDATED_TO_CHINESE[consolidated]})`)
    const variants = getVariantsForConsolidated(consolidated)
    setSelectedConsolidated({ name: consolidated, variants })
    setVideoPage(1)
    setCategoryVideos([])
    setLoadingCategoryVideos(true)

    try {
      const variantParams = variants.map(v => `variants=${encodeURIComponent(v)}`).join('&')
      const res = await fetch(`/api/admin/videos/by-category?${variantParams}&page=1`)
      const data = await res.json()
      setCategoryVideos(data.list || [])
    } catch (err) {
      console.error('Failed to fetch consolidated category videos:', err)
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
    setLoadingGlobalSearch(true)
    try {
      const res = await fetch(`/api/provide/vod?ac=detail&wd=${encodeURIComponent(query)}&pg=${page}`)
      const data = await res.json()
      const videos = (data.list || []).map((v: { vod_id: string; vod_name: string; vod_pic: string; type_name: string }) => ({
        vod_id: v.vod_id, vod_name: v.vod_name, vod_pic: v.vod_pic, type_name: v.type_name
      }))
      if (page === 1) {
        setGlobalSearchResults(videos)
        setGlobalSearchTotalCount(data.total || 0)
      } else {
        setGlobalSearchResults(prev => [...prev, ...videos])
      }
      setGlobalSearchPage(page)
    } catch { /* ignore */ }
    finally { setLoadingGlobalSearch(false) }
  }

  const handleDeleteVideo = async (vodId: string) => {
    try {
      const res = await fetch(`/api/admin/videos/${vodId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setCategoryVideos(prev => prev.filter(v => v.vod_id !== vodId))
        setGlobalSearchResults(prev => prev.filter(v => v.vod_id !== vodId))
        fetchStats()
      }
    } catch { /* ignore */ }
  }

  const handleBulkDelete = async () => {
    if (selectedSearchVideoIds.size === 0) return
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
        fetchStats()
      }
    } catch { /* ignore */ }
  }

  const toggleCategorySelection = (id: number) => {
    const newSet = new Set(selectedCategoryIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedCategoryIds(newSet)
  }

  const filteredCategories = stats?.categories.filter(cat =>
    cat.typeName.toLowerCase().includes(categorySearchQuery.toLowerCase())
  ) || []

  const filteredConsolidated = Object.entries(CONSOLIDATED_CATEGORIES).filter(([name]) =>
    name.toLowerCase().includes(categorySearchQuery.toLowerCase())
  )

  const paginatedVideos = categoryVideos.slice((videoPage - 1) * videosPerPage, videoPage * videosPerPage)
  const totalPages = Math.ceil(categoryVideos.length / videosPerPage)

  // Check if any scraping is active
  const isAnyScraping = scraping || keywordJobs.japanese.running || keywordJobs.chinese.running

  // Separate custom and regular categories
  const customCategories = availableCategories.filter(c => c.isCustom)
  const regularCategories = availableCategories.filter(c => !c.isCustom)

  if (!session) {
    return <div className="p-8 text-zinc-500">Please sign in.</div>
  }

  return (
    <div className="p-8 space-y-6">
      {/* Stats */}
      <div className="flex items-center gap-10 text-sm">
        <div>
          <span className="text-zinc-500">Videos</span>
          <span className="ml-2 text-zinc-100 font-semibold">{stats?.totalVideos.toLocaleString() || '0'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Categories</span>
          <span className="ml-2 text-zinc-100 font-semibold">{stats?.categories.length || 0}</span>
        </div>
        {currentProgress && (
          <>
            <div>
              <span className="text-zinc-500">New</span>
              <span className="ml-2 text-purple-400 font-semibold">{currentProgress.newVideosAdded?.toLocaleString() || 0}</span>
            </div>
            <div>
              <span className="text-zinc-500">Speed</span>
              <span className="ml-2 text-zinc-100 font-semibold">{currentProgress.videosPerSecond}/s</span>
            </div>
          </>
        )}
        {message && <span className="text-zinc-400">{message}</span>}
      </div>

      {/* Resume banner */}
      {savedProgress && !scraping && (
        <div className="flex items-center justify-between py-4 px-5 bg-zinc-900 rounded-lg border border-zinc-800">
          <span className="text-zinc-300">
            Saved: {savedProgress.categoriesCompleted}/{savedProgress.totalCategories} categories
          </span>
          <div className="flex gap-3">
            <button onClick={() => startScraping(savedProgress.checkpointId)} className="text-purple-400 hover:text-purple-300 font-medium">
              Resume
            </button>
            <button onClick={clearProgress} className="text-zinc-500 hover:text-zinc-300">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Progress bars */}
      {(scraping && currentProgress) && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-zinc-400">
            <span>Category Scraping {currentProgress.categoriesCompleted}/{currentProgress.totalCategories}</span>
            <span>{currentProgress.totalVideosScraped.toLocaleString()} videos</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all"
              style={{ width: `${(currentProgress.categoriesCompleted / currentProgress.totalCategories) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Keyword scraper progress */}
      {(keywordJobs.japanese.running || keywordJobs.chinese.running) && (
        <div className="space-y-3">
          {keywordJobs.japanese.running && keywordJobs.japanese.job && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-zinc-400">
                <span>Japanese Keywords {keywordJobs.japanese.job.keywordsCompleted}/{keywordJobs.japanese.job.totalKeywords}</span>
                <span>+{keywordJobs.japanese.job.totalScraped.toLocaleString()} new</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${(keywordJobs.japanese.job.keywordsCompleted / keywordJobs.japanese.job.totalKeywords) * 100}%` }}
                />
              </div>
            </div>
          )}
          {keywordJobs.chinese.running && keywordJobs.chinese.job && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-zinc-400">
                <span>Chinese Keywords {keywordJobs.chinese.job.keywordsCompleted}/{keywordJobs.chinese.job.totalKeywords}</span>
                <span>+{keywordJobs.chinese.job.totalScraped.toLocaleString()} new</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${(keywordJobs.chinese.job.keywordsCompleted / keywordJobs.chinese.job.totalKeywords) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unified Scraper */}
      <div className="p-5 bg-zinc-900 rounded-lg border border-zinc-800">
        <div className="flex items-center justify-between mb-5">
          <span className="font-medium text-lg">Scraper</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-500">Pages</span>
            <input
              type="number"
              min={1}
              max={100}
              value={pagesPerCategory}
              onChange={e => setPagesPerCategory(Math.max(1, Math.min(100, parseInt(e.target.value) || 5)))}
              className="w-16 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm text-center focus:border-purple-500 outline-none"
            />
          </div>
        </div>

        <button
          onClick={() => setShowCategoryFilter(!showCategoryFilter)}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 mb-4"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${showCategoryFilter ? 'rotate-180' : ''}`} />
          Filter Categories
          {selectedCategoryIds.size > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-purple-600/20 text-purple-400 rounded-full text-xs">
              {selectedCategoryIds.size} selected
            </span>
          )}
        </button>

        {showCategoryFilter && (
          <div className="mb-5 space-y-3">
            {/* Quick actions */}
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setSelectedCategoryIds(new Set(availableCategories.map(c => c.id)))}
                className="text-zinc-500 hover:text-zinc-300"
              >
                Select all
              </button>
              <span className="text-zinc-700">|</span>
              <button
                onClick={() => setSelectedCategoryIds(new Set())}
                className="text-zinc-500 hover:text-zinc-300"
              >
                Clear
              </button>
              {selectedCategoryIds.size > 0 && (
                <span className="text-zinc-600 ml-2">{selectedCategoryIds.size} selected</span>
              )}
            </div>

            {/* All categories in grid */}
            <div className="grid grid-cols-12 gap-1.5">
              {availableCategories.map(cat => (
                <Tag
                  key={cat.id}
                  selected={selectedCategoryIds.has(cat.id)}
                  onClick={() => toggleCategorySelection(cat.id)}
                >
                  {cat.name}
                </Tag>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => startScraping()}
          disabled={isAnyScraping}
          className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors text-base"
        >
          {isAnyScraping ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          {isAnyScraping ? 'Running...' : 'Start Scraping'}
        </button>
      </div>

      {/* Thumbnail Migration */}
      <ThumbnailMigration />

      {/* Category Browser */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        {/* Search bar */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search videos..."
                value={globalVideoSearchQuery}
                onChange={e => setGlobalVideoSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGlobalSearch(globalVideoSearchQuery)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm placeholder:text-zinc-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors"
              />
            </div>
            <button
              onClick={() => handleGlobalSearch(globalVideoSearchQuery)}
              disabled={loadingGlobalSearch}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium transition-colors"
            >
              {loadingGlobalSearch ? '...' : 'Search'}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 min-h-[500px]">
          {/* Categories sidebar */}
          <div className="border-r border-zinc-800 bg-zinc-900/50">
            <div className="p-3 border-b border-zinc-800 flex gap-2">
              <button
                onClick={() => setCategoryTab('database')}
                className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                  categoryTab === 'database'
                    ? 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Database
              </button>
              <button
                onClick={() => setCategoryTab('consolidated')}
                className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                  categoryTab === 'consolidated'
                    ? 'bg-purple-600 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Groups
              </button>
            </div>

            <div className="p-3">
              <input
                type="text"
                placeholder="Filter..."
                value={categorySearchQuery}
                onChange={e => setCategorySearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm placeholder:text-zinc-500 focus:border-purple-500 outline-none"
              />
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {categoryTab === 'database' ? (
                filteredCategories.length > 0 ? (
                  filteredCategories.map(cat => (
                    <button
                      key={cat.typeId}
                      onClick={() => handleSelectCategory(cat)}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-800 transition-colors ${
                        selectedCategory === cat.typeName
                          ? 'bg-purple-600/20 text-purple-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {cat.typeName}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-sm text-zinc-600 text-center">
                    No categories found
                  </div>
                )
              ) : (
                filteredConsolidated.length > 0 ? (
                  filteredConsolidated.map(([name]) => (
                    <button
                      key={name}
                      onClick={() => handleSelectConsolidatedCategory(name)}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-zinc-800 transition-colors ${
                        selectedConsolidated?.name === name
                          ? 'bg-purple-600/20 text-purple-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {name.replace(/-/g, ' ')}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-sm text-zinc-600 text-center">
                    No groups found
                  </div>
                )
              )}
            </div>
          </div>

          {/* Videos grid */}
          <div className="md:col-span-3 p-4">
            {globalSearchResults.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-zinc-400">{globalSearchTotalCount.toLocaleString()} results</span>
                  {selectedSearchVideoIds.size > 0 && (
                    <button onClick={handleBulkDelete} className="text-sm text-red-400 hover:text-red-300 font-medium">
                      Delete {selectedSearchVideoIds.size} selected
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
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
                    className="w-full mt-4 py-3 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    Load more
                  </button>
                )}
              </>
            ) : selectedCategory ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-zinc-300">{selectedCategory}</span>
                  <span className="text-sm text-zinc-500">{categoryVideos.length} videos</span>
                </div>
                {loadingCategoryVideos ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
                  </div>
                ) : categoryVideos.length > 0 ? (
                  <>
                    <div className="grid grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {paginatedVideos.map(video => (
                        <VideoCard key={video.vod_id} video={video} onDelete={() => handleDeleteVideo(video.vod_id)} />
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex justify-center gap-2 mt-4">
                        {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
                          <button
                            key={p}
                            onClick={() => setVideoPage(p)}
                            className={`w-8 h-8 text-sm rounded-md transition-colors ${
                              videoPage === p
                                ? 'bg-purple-600 text-white'
                                : 'text-zinc-400 hover:bg-zinc-800'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-64 text-zinc-600">
                    No videos in this category
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-600">
                Select a category or search
              </div>
            )}
          </div>
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
    <div className={`group relative rounded-lg overflow-hidden ${selected ? 'ring-2 ring-purple-500' : ''}`}>
      {video.vod_pic ? (
        <img src={video.vod_pic} alt="" className="w-full aspect-video object-cover bg-zinc-800" />
      ) : (
        <div className="w-full aspect-video bg-zinc-800" />
      )}
      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        {onSelect && (
          <button onClick={onSelect} className="p-2 bg-zinc-700/80 rounded-lg hover:bg-purple-600 transition-colors">
            <Check className="w-4 h-4" />
          </button>
        )}
        <a href={`/watch/${video.vod_id}`} target="_blank" className="p-2 bg-zinc-700/80 rounded-lg hover:bg-zinc-600 transition-colors">
          <Eye className="w-4 h-4" />
        </a>
        <button onClick={onDelete} className="p-2 bg-red-600/80 rounded-lg hover:bg-red-500 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
