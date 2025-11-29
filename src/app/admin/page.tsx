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
  keywordsCompleted: number
  totalKeywords: number
}

const STORAGE_KEY = 'scraper_progress'

export default function AdminDashboard() {
  const { data: session } = useSession()

  const [scraping, setScraping] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [message, setMessage] = useState('')
  const [pagesPerCategory, setPagesPerCategory] = useState(5)
  const [showCategoryFilter, setShowCategoryFilter] = useState(false)
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

  const [keywordScrapingJapanese, setKeywordScrapingJapanese] = useState(false)
  const [keywordScrapingChinese, setKeywordScrapingChinese] = useState(false)
  const [keywordJobJapanese, setKeywordJobJapanese] = useState<KeywordJob | null>(null)
  const [keywordJobChinese, setKeywordJobChinese] = useState<KeywordJob | null>(null)
  const [keywordPagesPerKeyword, setKeywordPagesPerKeyword] = useState(3)

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

  const startScraping = async (resumeId?: string) => {
    setScraping(true)
    setMessage('Starting...')

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

  const startKeywordScraping = async (category: 'japanese' | 'chinese') => {
    const setLoading = category === 'japanese' ? setKeywordScrapingJapanese : setKeywordScrapingChinese
    const setJob = category === 'japanese' ? setKeywordJobJapanese : setKeywordJobChinese

    setLoading(true)
    try {
      const res = await fetch('/api/scraper/keyword-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, pagesPerKeyword: keywordPagesPerKeyword })
      })
      const data = await res.json()

      if (data.success) {
        const pollInterval = setInterval(async () => {
          const statusRes = await fetch(`/api/scraper/keyword-search?jobId=${data.jobId}`)
          const statusData = await statusRes.json()
          if (statusData.success) {
            setJob(statusData.job)
            if (statusData.job.status === 'completed' || statusData.job.status === 'failed') {
              clearInterval(pollInterval)
              setLoading(false)
              fetchStats()
            }
          }
        }, 2000)
      } else {
        setLoading(false)
      }
    } catch { setLoading(false) }
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
    } catch { setCategoryVideos([]) }
    finally { setLoadingCategoryVideos(false) }
  }

  const handleSelectConsolidatedCategory = async (consolidated: string) => {
    setSelectedCategory(`${consolidated} (${CONSOLIDATED_TO_CHINESE[consolidated]})`)
    const variants = getVariantsForConsolidated(consolidated)
    setSelectedConsolidated({ name: consolidated, variants })
    setVideoPage(1)
    setLoadingCategoryVideos(true)
    try {
      const variantParams = variants.map(v => `variants=${encodeURIComponent(v)}`).join('&')
      const res = await fetch(`/api/admin/videos/by-category?${variantParams}&page=1`)
      const data = await res.json()
      setCategoryVideos(data.list || [])
    } catch { setCategoryVideos([]) }
    finally { setLoadingCategoryVideos(false) }
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

  const filteredCategories = stats?.categories.filter(cat =>
    cat.typeName.toLowerCase().includes(categorySearchQuery.toLowerCase())
  ) || []

  const filteredConsolidated = Object.entries(CONSOLIDATED_CATEGORIES).filter(([name]) =>
    name.toLowerCase().includes(categorySearchQuery.toLowerCase())
  )

  const paginatedVideos = categoryVideos.slice((videoPage - 1) * videosPerPage, videoPage * videosPerPage)
  const totalPages = Math.ceil(categoryVideos.length / videosPerPage)

  if (!session) {
    return <div className="p-8 text-zinc-500 text-sm">Please sign in.</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="flex items-center gap-8 text-xs">
        <div>
          <span className="text-zinc-500">Videos</span>
          <span className="ml-2 text-zinc-100 font-medium">{stats?.totalVideos.toLocaleString() || '0'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Categories</span>
          <span className="ml-2 text-zinc-100 font-medium">{stats?.categories.length || 0}</span>
        </div>
        {currentProgress && (
          <>
            <div>
              <span className="text-zinc-500">New</span>
              <span className="ml-2 text-emerald-400 font-medium">{currentProgress.newVideosAdded?.toLocaleString() || 0}</span>
            </div>
            <div>
              <span className="text-zinc-500">Speed</span>
              <span className="ml-2 text-zinc-100 font-medium">{currentProgress.videosPerSecond}/s</span>
            </div>
          </>
        )}
        {message && <span className="text-zinc-400">{message}</span>}
      </div>

      {/* Resume banner */}
      {savedProgress && !scraping && (
        <div className="flex items-center justify-between py-3 px-4 bg-zinc-900 rounded border border-zinc-800 text-xs">
          <span className="text-zinc-400">
            Saved: {savedProgress.categoriesCompleted}/{savedProgress.totalCategories} categories
          </span>
          <div className="flex gap-2">
            <button onClick={() => startScraping(savedProgress.checkpointId)} className="text-zinc-100 hover:text-white">
              Resume
            </button>
            <button onClick={clearProgress} className="text-zinc-500 hover:text-zinc-300">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {scraping && currentProgress && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Scraping {currentProgress.categoriesCompleted}/{currentProgress.totalCategories}</span>
            <span>{currentProgress.totalVideosScraped.toLocaleString()} videos</span>
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-500 transition-all"
              style={{ width: `${(currentProgress.categoriesCompleted / currentProgress.totalCategories) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Scrapers */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Category Scraper */}
        <div className="p-4 bg-zinc-900/50 rounded border border-zinc-800/50">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-zinc-300">Category Scraper</span>
            <div className="flex gap-1">
              {[3, 5, 10, 20].map(n => (
                <button
                  key={n}
                  onClick={() => setPagesPerCategory(n)}
                  className={`px-2 py-1 text-xs rounded ${pagesPerCategory === n ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowCategoryFilter(!showCategoryFilter)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 mb-3"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${showCategoryFilter ? 'rotate-180' : ''}`} />
            Filter
          </button>

          {showCategoryFilter && (
            <div className="mb-3 max-h-32 overflow-y-auto space-y-1 text-xs">
              {availableCategories.map(cat => (
                <label key={cat.id} className="flex items-center gap-2 text-zinc-400 hover:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.has(cat.id)}
                    onChange={e => {
                      const newSet = new Set(selectedCategoryIds)
                      if (e.target.checked) newSet.add(cat.id)
                      else newSet.delete(cat.id)
                      setSelectedCategoryIds(newSet)
                    }}
                    className="rounded border-zinc-600 bg-zinc-800"
                  />
                  {cat.name}
                </label>
              ))}
            </div>
          )}

          <button
            onClick={() => startScraping()}
            disabled={scraping}
            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded text-xs font-medium flex items-center justify-center gap-2"
          >
            {scraping ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {scraping ? 'Running...' : 'Start'}
          </button>
        </div>

        {/* Keyword Scraper */}
        <div className="p-4 bg-zinc-900/50 rounded border border-zinc-800/50">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-zinc-300">Keyword Scraper</span>
            <div className="flex gap-1">
              {[1, 3, 5, 10].map(n => (
                <button
                  key={n}
                  onClick={() => setKeywordPagesPerKeyword(n)}
                  className={`px-2 py-1 text-xs rounded ${keywordPagesPerKeyword === n ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => startKeywordScraping('japanese')}
              disabled={keywordScrapingJapanese}
              className="py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded text-xs font-medium"
            >
              {keywordScrapingJapanese ? `JP ${keywordJobJapanese?.keywordsCompleted || 0}/${keywordJobJapanese?.totalKeywords || 0}` : 'Japanese'}
            </button>
            <button
              onClick={() => startKeywordScraping('chinese')}
              disabled={keywordScrapingChinese}
              className="py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded text-xs font-medium"
            >
              {keywordScrapingChinese ? `CN ${keywordJobChinese?.keywordsCompleted || 0}/${keywordJobChinese?.totalKeywords || 0}` : 'Chinese'}
            </button>
          </div>
        </div>
      </div>

      {/* Thumbnail Migration */}
      <ThumbnailMigration />

      {/* Category Browser */}
      <div className="bg-zinc-900/50 rounded border border-zinc-800/50 overflow-hidden">
        {/* Search bar */}
        <div className="p-3 border-b border-zinc-800/50">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
              <input
                type="text"
                placeholder="Search videos..."
                value={globalVideoSearchQuery}
                onChange={e => setGlobalVideoSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGlobalSearch(globalVideoSearchQuery)}
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-500"
              />
            </div>
            <button
              onClick={() => handleGlobalSearch(globalVideoSearchQuery)}
              disabled={loadingGlobalSearch}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs"
            >
              {loadingGlobalSearch ? '...' : 'Search'}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 min-h-[400px]">
          {/* Categories sidebar */}
          <div className="border-r border-zinc-800/50">
            <div className="p-2 border-b border-zinc-800/50 flex gap-1">
              <button
                onClick={() => setCategoryTab('database')}
                className={`flex-1 py-1 text-xs rounded ${categoryTab === 'database' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`}
              >
                DB
              </button>
              <button
                onClick={() => setCategoryTab('consolidated')}
                className={`flex-1 py-1 text-xs rounded ${categoryTab === 'consolidated' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`}
              >
                Groups
              </button>
            </div>

            <div className="p-2">
              <input
                type="text"
                placeholder="Filter..."
                value={categorySearchQuery}
                onChange={e => setCategorySearchQuery(e.target.value)}
                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-500"
              />
            </div>

            <div className="max-h-[320px] overflow-y-auto">
              {categoryTab === 'database' ? (
                filteredCategories.map(cat => (
                  <button
                    key={cat.typeId}
                    onClick={() => handleSelectCategory(cat)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-800/50 ${selectedCategory === cat.typeName ? 'bg-zinc-800/50 text-zinc-100' : 'text-zinc-400'}`}
                  >
                    {cat.typeName}
                  </button>
                ))
              ) : (
                filteredConsolidated.map(([name]) => (
                  <button
                    key={name}
                    onClick={() => handleSelectConsolidatedCategory(name)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-800/50 ${selectedConsolidated?.name === name ? 'bg-zinc-800/50 text-zinc-100' : 'text-zinc-400'}`}
                  >
                    {name.replace(/-/g, ' ')}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Videos grid */}
          <div className="md:col-span-3 p-3">
            {globalSearchResults.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-zinc-500">{globalSearchTotalCount.toLocaleString()} results</span>
                  {selectedSearchVideoIds.size > 0 && (
                    <button onClick={handleBulkDelete} className="text-xs text-red-400 hover:text-red-300">
                      Delete {selectedSearchVideoIds.size}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
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
                    className="w-full mt-3 py-2 text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    Load more
                  </button>
                )}
              </>
            ) : selectedCategory ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-zinc-400">{selectedCategory}</span>
                </div>
                {loadingCategoryVideos ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-4 h-4 animate-spin text-zinc-500" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                      {paginatedVideos.map(video => (
                        <VideoCard key={video.vod_id} video={video} onDelete={() => handleDeleteVideo(video.vod_id)} />
                      ))}
                    </div>
                    {totalPages > 1 && (
                      <div className="flex justify-center gap-1 mt-3">
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                          <button
                            key={p}
                            onClick={() => setVideoPage(p)}
                            className={`w-6 h-6 text-xs rounded ${videoPage === p ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
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
              <div className="flex items-center justify-center h-full text-xs text-zinc-600">
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
    <div className={`group relative rounded overflow-hidden ${selected ? 'ring-1 ring-zinc-500' : ''}`}>
      {video.vod_pic ? (
        <img src={video.vod_pic} alt="" className="w-full aspect-video object-cover bg-zinc-800" />
      ) : (
        <div className="w-full aspect-video bg-zinc-800" />
      )}
      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
        {onSelect && (
          <button onClick={onSelect} className="p-1.5 bg-zinc-700/80 rounded hover:bg-zinc-600">
            <Check className="w-3 h-3" />
          </button>
        )}
        <a href={`/watch/${video.vod_id}`} target="_blank" className="p-1.5 bg-zinc-700/80 rounded hover:bg-zinc-600">
          <Eye className="w-3 h-3" />
        </a>
        <button onClick={onDelete} className="p-1.5 bg-red-900/80 rounded hover:bg-red-800">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
