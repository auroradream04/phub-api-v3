'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { PlayCircle, RefreshCw, Trash2, Database, Languages, ChevronDown, ChevronUp, Grid, List as ListIcon, Eye, Check } from 'lucide-react'
import { CONSOLIDATED_CATEGORIES, CONSOLIDATED_TO_CHINESE, CONSOLIDATED_TYPE_IDS, getVariantsForConsolidated } from '@/lib/maccms-mappings'

interface Stats {
  totalVideos: number
  categories: Array<{ typeId: number; typeName: string; _count: number }>
}

interface RetryStats {
  total: number
  byRetryCount: Array<{ retries: number; count: number }>
}

interface TranslationStats {
  totalNonChineseTitles: number
  needsTranslation: number
  neverAttempted: number
  totalVideos: number
  failedByRetry: Array<{ retries: number; count: number }>
}

interface TranslationProgress {
  processed: number
  total: number
  completed: boolean
  current?: {
    id: string
    vodId: string
    originalTitle: string
    translated: string | null
    success: boolean
    message: string
    retryCount?: number
  }
  summary?: {
    totalProcessed: number
    successCount: number
    failedCount: number
    message: string
  }
  stats?: {
    elapsedSeconds: number
    videosPerMinute: number
    estimatedMinutesRemaining: number
    successCount: number
    failCount: number
  }
  error?: boolean
  message?: string
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

const STORAGE_KEY = 'scraper_progress'

export default function AdminDashboard() {
  const { data: session } = useSession()

  // States
  const [scraping, setScraping] = useState(false)
  const [stats, setStats] = useState<Stats | null>(null)
  const [retryStats, setRetryStats] = useState<RetryStats | null>(null)
  const [message, setMessage] = useState('')
  const [pagesPerCategory, setPagesPerCategory] = useState(5)
  const [retryLimit, _setRetryLimit] = useState(100)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [checkpointId, setCheckpointId] = useState('')
  const [savedProgress, setSavedProgress] = useState<ScraperProgress | null>(null)
  const [currentProgress, setCurrentProgress] = useState<ScraperProgress | null>(null)
  const checkpointIdRef = useRef<string>('')

  // Category filtering states
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(new Set())
  
  const [availableCategories, setAvailableCategories] = useState<Array<{id: number; name: string; isCustom: boolean}>>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [categoriesSearchQuery, setCategoriesSearchQuery] = useState('')

  // Category browser states
  const [categoryTab, setCategoryTab] = useState<'database' | 'consolidated'>('database')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedConsolidated, setSelectedConsolidated] = useState<{ name: string; variants: string[] } | null>(null)
  const [categoryVideos, setCategoryVideos] = useState<MaccmsVideo[]>([])
  const [loadingCategoryVideos, setLoadingCategoryVideos] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<'videos' | 'variants'>('videos')
  const [expandedVariantDropdown, setExpandedVariantDropdown] = useState(false)
  const [videoSearchQuery, setVideoSearchQuery] = useState('')
  const [videoPage, setVideoPage] = useState(1)
  const [categorySearchQuery, setCategorySearchQuery] = useState('')
  const [globalVideoSearchQuery, setGlobalVideoSearchQuery] = useState('')
  const [globalSearchResults, setGlobalSearchResults] = useState<MaccmsVideo[]>([])
  const [loadingGlobalSearch, setLoadingGlobalSearch] = useState(false)
  const [globalSearchPage, setGlobalSearchPage] = useState(1)
  const [globalSearchTotalCount, setGlobalSearchTotalCount] = useState(0)
  const [globalLoadingPage, setGlobalLoadingPage] = useState(false)
  const [selectedSearchVideoIds, setSelectedSearchVideoIds] = useState<Set<string>>(new Set())
  const [selectAllSearchVideos, setSelectAllSearchVideos] = useState(false)
  const [deletingAllSearch, setDeletingAllSearch] = useState(false)

  // Translation states
  const [translationStats, setTranslationStats] = useState<TranslationStats | null>(null)
  const [translating, setTranslating] = useState(false)
  const [translationProgress, setTranslationProgress] = useState<TranslationProgress | null>(null)
  const [showTranslationOptions, setShowTranslationOptions] = useState(false)
  const [translationConcurrency, setTranslationConcurrency] = useState(10)
  const [translationDelay, setTranslationDelay] = useState(500)
  const [translationLimit, setTranslationLimit] = useState('')
  const [translationMaxRetries, setTranslationMaxRetries] = useState(5)

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
    fetchTranslationStats()
  }, [])

  // Load categories for filtering
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoadingCategories(true)
        const res = await fetch('/api/categories')
        const data = await res.json()
        // Extract categories array
        const cats = Array.isArray(data) ? data : (data.categories || data || [])
        // Map to the format we need: {id, name, isCustom}
        // Convert category names to human-readable format (e.g., "muscular-men" -> "Muscular Men")
        const formatted = cats.map((cat: any) => ({
          id: cat.id,
          name: cat.name
            ? cat.name
                .split('-')
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
            : '',
          isCustom: cat.isCustom ?? false
        }))
        setAvailableCategories(formatted)
      } catch (error) {
        console.error('Failed to load categories:', error)
      } finally {
        setLoadingCategories(false)
      }
    }
    
    loadCategories()
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

  const fetchTranslationStats = async () => {
    try {
      const res = await fetch('/api/admin/translate-videos')
      const data = await res.json()
      if (data.success) setTranslationStats(data.stats)
    } catch (error) {
      console.error('Failed to fetch translation stats:', error)
    }
  }

  const startTranslation = async () => {
    if (!translationStats || translationStats.totalNonChineseTitles === 0) {
      setMessage('No videos need translation')
      return
    }

    setTranslating(true)
    setTranslationProgress({ processed: 0, total: 0, completed: false })
    setMessage('Starting translation...')

    try {
      // Build query params
      const params = new URLSearchParams()
      params.append('concurrency', String(translationConcurrency))
      params.append('delay', String(translationDelay))
      params.append('maxRetries', String(translationMaxRetries))
      if (translationLimit) {
        params.append('limit', translationLimit)
      }

      const response = await fetch(`/api/admin/translate-videos?${params.toString()}`, {
        method: 'POST'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const progress = JSON.parse(line) as TranslationProgress
            setTranslationProgress(progress)

            if (progress.completed) {
              await fetchTranslationStats()
              await fetchRetryStats()
              await fetchStats()
            }
          } catch (error) {
            console.error('Failed to parse progress:', error)
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setMessage(`❌ Translation failed: ${errorMsg}`)
      setTranslationProgress({ processed: 0, total: 0, completed: true, error: true, message: errorMsg })
    } finally {
      setTranslating(false)
    }
  }

  // Category browser handlers
  const handleSelectDatabaseCategory = async (categoryName: string) => {
    setSelectedCategory(categoryName)
    setVideoPage(1)
    setVideoSearchQuery('')
    setLoadingCategoryVideos(true)
    setRightPanelTab('videos')
    try {
      const res = await fetch(
        `/api/admin/videos/by-category?category=${encodeURIComponent(categoryName)}&page=1`
      )
      const data = await res.json()
      setCategoryVideos(data.list || [])
    } catch (error) {
      console.error('Failed to fetch videos:', error)
      setCategoryVideos([])
    } finally {
      setLoadingCategoryVideos(false)
    }
  }

  const handleSelectVariant = async (variantName: string) => {
    const capitalizedVariant = variantName.charAt(0).toUpperCase() + variantName.slice(1)
    setSelectedCategory(capitalizedVariant)
    setVideoPage(1)
    setVideoSearchQuery('')
    setLoadingCategoryVideos(true)
    setRightPanelTab('videos')
    try {
      const res = await fetch(
        `/api/admin/videos/by-category?category=${encodeURIComponent(variantName)}&page=1`
      )
      const data = await res.json()
      setCategoryVideos(data.list || [])
    } catch (error) {
      console.error('Failed to fetch videos:', error)
      setCategoryVideos([])
    } finally {
      setLoadingCategoryVideos(false)
    }
  }

  // Filter and paginate videos based on search query
  const filteredVideos = categoryVideos.filter(video =>
    video.vod_name.toLowerCase().includes(videoSearchQuery.toLowerCase())
  )
  const videosPerPage = 20
  const _totalPages = Math.ceil(filteredVideos.length / videosPerPage)
  const startIndex = (videoPage - 1) * videosPerPage
  const paginatedVideos = filteredVideos.slice(startIndex, startIndex + videosPerPage)

  // For category pagination: API already returns paginated results, so use categoryVideos directly
  // For search pagination: apply client-side pagination to filtered results
  const videosToDisplay = videoSearchQuery ? paginatedVideos : categoryVideos

  // Calculate total pages for selected category
  let selectedCategoryCount = 0
  if (selectedConsolidated) {
    // For consolidated categories, sum up all variant counts
    selectedCategoryCount = selectedConsolidated.variants.reduce((sum, variant) => {
      const count = stats?.categories.find(c => c.typeName.toLowerCase() === variant.toLowerCase())?._count || 0
      return sum + count
    }, 0)
  } else if (selectedCategory) {
    // For database categories, find exact match
    selectedCategoryCount = stats?.categories.find(c => c.typeName === selectedCategory)?._count || 0
  }
  const categoryTotalPages = Math.ceil(selectedCategoryCount / videosPerPage)

  // Debug logging
  if (selectedCategory && categoryVideos.length > 0) {
    console.log('Selected:', selectedCategory, 'Count:', selectedCategoryCount, 'Pages:', categoryTotalPages, 'videosPerPage:', videosPerPage)
  }

  // Filter categories based on search query
  const getFilteredCategories = () => {
    if (!stats) return []
    return stats.categories.filter(cat =>
      cat.typeName.toLowerCase().includes(categorySearchQuery.toLowerCase())
    )
  }
  const filteredCategories = getFilteredCategories()

  // Global search - paginate results (already filtered from server)
  const globalTotalPages = Math.ceil(globalSearchTotalCount / videosPerPage)
  const globalStartIndex = (globalSearchPage - 1) * videosPerPage
  const globalPaginatedVideos = globalSearchResults.slice(globalStartIndex, globalStartIndex + videosPerPage)

  const handleSelectConsolidatedCategory = async (consolidated: string, _typeId: number) => {
    const capitalizedName = consolidated.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    setSelectedCategory(`${capitalizedName} (${CONSOLIDATED_TO_CHINESE[consolidated]})`)
    const variants = getVariantsForConsolidated(consolidated)
    setSelectedConsolidated({ name: consolidated, variants })
    setVideoPage(1)
    setVideoSearchQuery('')
    setRightPanelTab('videos')
    setLoadingCategoryVideos(true)
    try {
      // Fetch videos from all variants of this consolidated category
      const variantParams = variants.map(v => `variants=${encodeURIComponent(v)}`).join('&')
      const res = await fetch(
        `/api/admin/videos/by-category?${variantParams}&page=1`
      )
      const data = await res.json()
      setCategoryVideos(data.list || [])
    } catch (error) {
      console.error('Failed to fetch videos:', error)
      setCategoryVideos([])
    } finally {
      setLoadingCategoryVideos(false)
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
        // Use checkpoint's startedAt if available
        const startedAt = checkpointData.checkpoint?.startedAt || currentProgress?.startedAt || new Date().toISOString()
        const elapsedSeconds = (Date.now() - new Date(startedAt).getTime()) / 1000

        const totalVideos = checkpointData.progress.totalVideosScraped || 0
        const pagesProcessed = checkpointData.progress.categoriesCompleted * pagesPerCategory

        // Calculate new videos added
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
          newVideosAdded: newVideosAdded,
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
    if (!resuming) {
      const categoryCount = selectedCategoryIds.size > 0 ? selectedCategoryIds.size : 'all'
      const categoryLabel = selectedCategoryIds.size === 1 ? 'category' : 'categories'
      const msg = selectedCategoryIds.size > 0
        ? `Start scraping ${pagesPerCategory} pages from ${selectedCategoryIds.size} selected ${categoryLabel}?`
        : `Start scraping ${pagesPerCategory} pages from each of all categories?`
      if (!confirm(msg)) return
    }

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
      const body: Record<string, unknown> = {
        pagesPerCategory,
        resumeCheckpointId: resumeFromCheckpoint || checkpointId || undefined
      }
      
      // Add category filter if selected
      if (selectedCategoryIds.size > 0) {
        body.categoryIds = Array.from(selectedCategoryIds)
      }
      
      const res = await fetch('/api/scraper/categories-with-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
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
    } catch {
      setMessage(`❌ Failed to delete videos`)
    }
  }

  // Clean up Unknown category videos

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
    } catch {
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

              {/* Category Selector */}
              {loadingCategories ? (
                <p className="text-sm text-muted-foreground py-4">Loading categories...</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-foreground uppercase tracking-wider">
                      Filter by Categories (Optional)
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedCategoryIds(new Set(availableCategories.map((c) => c.id)))}
                        className="text-xs px-3 py-1.5 rounded bg-muted text-foreground hover:bg-muted/80 transition-colors font-medium"
                        disabled={scraping}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setSelectedCategoryIds(new Set())}
                        className="text-xs px-3 py-1.5 rounded bg-muted text-foreground hover:bg-muted/80 transition-colors font-medium"
                        disabled={scraping}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  
                  <input
                    type="text"
                    placeholder="Search categories..."
                    value={categoriesSearchQuery}
                    onChange={(e) => setCategoriesSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 text-sm border border-border/50 rounded-lg bg-input placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                    disabled={scraping}
                  />
                  
                  <div className="border border-border/50 rounded-xl bg-card/50 p-5 max-h-80 overflow-y-auto">
                    {Array.isArray(availableCategories) && availableCategories.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {availableCategories
                          .filter((cat) =>
                            cat.name.toLowerCase().includes(categoriesSearchQuery.toLowerCase())
                          )
                          .map((cat) => (
                            <button
                              key={cat.id}
                              onClick={() => {
                                const newSelected = new Set(selectedCategoryIds)
                                if (newSelected.has(cat.id)) {
                                  newSelected.delete(cat.id)
                                } else {
                                  newSelected.add(cat.id)
                                }
                                setSelectedCategoryIds(newSelected)
                              }}
                              disabled={scraping}
                              className={`relative px-3 py-2 rounded-lg text-sm text-left transition-all border-2 ${
                                selectedCategoryIds.has(cat.id)
                                  ? 'border-primary bg-primary/10 text-foreground font-medium'
                                  : 'border-border/50 bg-card/30 text-muted-foreground hover:border-primary/50 hover:bg-card/50'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              <div className="flex items-start gap-2">
                                <div className={`w-4 h-4 rounded border-2 mt-0.5 flex-shrink-0 transition-all ${
                                  selectedCategoryIds.has(cat.id)
                                    ? 'border-primary bg-primary'
                                    : 'border-border/50'
                                }`}>
                                  {selectedCategoryIds.has(cat.id) && (
                                    <svg className="w-full h-full text-white" viewBox="0 0 16 16" fill="currentColor">
                                      <path d="M13.5 2L6 10.5 2.5 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>
                                <span className="break-words">{cat.name}</span>
                                {cat.isCustom && <span className="text-xs text-primary font-semibold whitespace-nowrap">★</span>}
                              </div>
                            </button>
                          ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-8">No categories available</p>
                    )}
                  </div>
                  
                  {selectedCategoryIds.size > 0 && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3">
                      <p className="text-sm text-blue-400 font-medium">
                        ✓ {selectedCategoryIds.size} category/categories selected
                      </p>
                      <p className="text-xs text-blue-400/80 mt-1">Will only scrape these categories</p>
                    </div>
                  )}
                  {selectedCategoryIds.size === 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      No categories selected - will scrape all {availableCategories.length} categories
                    </p>
                  )}
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

          {/* Translation Options */}
          <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-2xl p-8 shadow-sm mt-8">
            <div className="space-y-4">
              {/* Translation Options Toggle */}
              <button
                onClick={() => setShowTranslationOptions(!showTranslationOptions)}
                className="text-sm font-semibold text-muted-foreground hover:text-primary flex items-center gap-2 transition-colors uppercase tracking-wider"
              >
                {showTranslationOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Translation Options
              </button>

              {showTranslationOptions && (
                <div className="bg-muted/30 border border-border/50 rounded-xl p-6 space-y-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Concurrency (1-100)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={translationConcurrency}
                      onChange={(e) => setTranslationConcurrency(Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))}
                      disabled={translating}
                      className="w-full px-4 py-2 border border-border bg-input text-foreground rounded-lg disabled:opacity-50 transition-colors"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Parallel requests (default: 10, max: 100)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Delay (milliseconds)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={translationDelay}
                      onChange={(e) => setTranslationDelay(Math.max(0, parseInt(e.target.value) || 500))}
                      disabled={translating}
                      className="w-full px-4 py-2 border border-border bg-input text-foreground rounded-lg disabled:opacity-50 transition-colors"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Delay between batches (default: 500ms)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Limit (optional)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={translationLimit}
                      onChange={(e) => setTranslationLimit(e.target.value)}
                      disabled={translating}
                      placeholder="Leave empty for ALL"
                      className="w-full px-4 py-2 border border-border bg-input text-foreground rounded-lg disabled:opacity-50 transition-colors"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Max videos to translate (default: ALL)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Max Retries
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={translationMaxRetries}
                      onChange={(e) => setTranslationMaxRetries(Math.max(0, Math.min(20, parseInt(e.target.value) || 5)))}
                      disabled={translating}
                      className="w-full px-4 py-2 border border-border bg-input text-foreground rounded-lg disabled:opacity-50 transition-colors"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Skip after N failures (default: 5)</p>
                  </div>
                </div>
              )}

              {/* Quick Presets */}
              {showTranslationOptions && (
                <div className="bg-muted/30 border border-border/50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick Presets</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <button
                      onClick={() => { setTranslationConcurrency(5); setTranslationDelay(2000); setTranslationMaxRetries(5) }}
                      disabled={translating}
                      className="px-3 py-2 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-lg disabled:opacity-50 transition-colors font-medium"
                    >
                      🐢 Safe (5 parallel, 2s delay)
                    </button>
                    <button
                      onClick={() => { setTranslationConcurrency(10); setTranslationDelay(500); setTranslationMaxRetries(5) }}
                      disabled={translating}
                      className="px-3 py-2 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-lg disabled:opacity-50 transition-colors font-medium"
                    >
                      ⚡ Balanced (10 parallel, 500ms)
                    </button>
                    <button
                      onClick={() => { setTranslationConcurrency(50); setTranslationDelay(200); setTranslationMaxRetries(3) }}
                      disabled={translating}
                      className="px-3 py-2 text-xs bg-muted hover:bg-muted/80 text-foreground rounded-lg disabled:opacity-50 transition-colors font-medium"
                    >
                      🚀 Fast (50 parallel, 200ms)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Secondary Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-6 border-t border-border">
            <button
              onClick={startTranslation}
              disabled={!translationStats || translationStats.totalNonChineseTitles === 0 || translating}
              className="px-4 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
            >
              {translating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Translating...
                </>
              ) : (
                <>
                  <Languages className="w-5 h-5" />
                  Translate Videos ({translationStats?.totalNonChineseTitles || 0})
                </>
              )}
            </button>

            <button
              onClick={retryTranslations}
              disabled={!retryStats || retryStats.total === 0}
              className="px-4 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
            >
              <Languages className="w-5 h-5" />
              Retry Translations ({retryStats?.total || 0})
            </button>

            <button
              onClick={clearCache}
              className="px-4 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-all font-medium flex items-center justify-center gap-2"
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
                <p className="text-sm text-muted-foreground mb-1">New Added</p>
                <p className="text-2xl font-bold text-emerald-500">
                  {(currentProgress.newVideosAdded ?? 0).toLocaleString()}
                </p>
                {currentProgress.totalVideosScraped > 0 && (
                  <p className="text-xs text-emerald-400 mt-1">
                    {Math.round(((currentProgress.newVideosAdded ?? 0) / currentProgress.totalVideosScraped) * 100)}% new
                  </p>
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

        {/* Translation Progress Display */}
        {translationProgress && translating && (
          <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-6 shadow-lg mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-foreground">Translation in Progress</h3>
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-green-600" />
                <span className="text-sm text-muted-foreground">Live</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">
                  {translationProgress.processed}/{translationProgress.total} videos
                </p>
                <p className="text-sm font-medium text-green-600">
                  {translationProgress.total > 0
                    ? `${Math.round((translationProgress.processed / translationProgress.total) * 100)}%`
                    : '0%'}
                </p>
              </div>
              <div className="bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-full transition-all duration-300"
                  style={{
                    width: translationProgress.total > 0
                      ? `${(translationProgress.processed / translationProgress.total) * 100}%`
                      : '0%'
                  }}
                />
              </div>
            </div>

            {/* Statistics */}
            {translationProgress.stats && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
                <div className="bg-card/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Elapsed</p>
                  <p className="text-xl font-bold text-foreground">
                    {Math.floor(translationProgress.stats.elapsedSeconds / 60)}m {translationProgress.stats.elapsedSeconds % 60}s
                  </p>
                </div>
                <div className="bg-card/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Speed</p>
                  <p className="text-xl font-bold text-green-600">
                    {translationProgress.stats.videosPerMinute} /min
                  </p>
                </div>
                <div className="bg-card/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">ETA</p>
                  <p className="text-xl font-bold text-blue-600">
                    {translationProgress.stats.estimatedMinutesRemaining}m
                  </p>
                </div>
                <div className="bg-card/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Success</p>
                  <p className="text-xl font-bold text-green-600">
                    {translationProgress.stats.successCount}
                  </p>
                </div>
                <div className="bg-card/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Failed</p>
                  <p className="text-xl font-bold text-red-600">
                    {translationProgress.stats.failCount}
                  </p>
                </div>
              </div>
            )}

            {/* Current video being translated */}
            {translationProgress.current && (
              <div className={`bg-card/50 rounded-lg p-4 mb-4 border ${
                translationProgress.current.success
                  ? 'border-green-500/30'
                  : 'border-red-500/30'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    translationProgress.current.success
                      ? 'bg-green-500/20'
                      : 'bg-red-500/20'
                  }`}>
                    {translationProgress.current.success ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <span className="text-red-600 text-lg">✕</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground mb-1">
                      {translationProgress.current.message}
                    </p>
                    {translationProgress.current.translated && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        → {translationProgress.current.translated}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Translation Complete Display */}
        {translationProgress && translationProgress.completed && (
          <div className={`rounded-xl p-6 shadow-lg mt-6 ${
            translationProgress.error
              ? 'bg-red-500/10 border border-red-500/20'
              : 'bg-green-500/10 border border-green-500/20'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              {translationProgress.error ? (
                <span className="text-2xl">❌</span>
              ) : (
                <Check className="w-6 h-6 text-green-600" />
              )}
              <h3 className="text-lg font-bold text-foreground">
                {translationProgress.error ? 'Translation Error' : 'Translation Complete'}
              </h3>
            </div>

            {translationProgress.summary && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Processed</p>
                  <p className="text-2xl font-bold text-foreground">
                    {translationProgress.summary.totalProcessed}
                  </p>
                </div>
                <div className="bg-card/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Successful</p>
                  <p className="text-2xl font-bold text-green-600">
                    {translationProgress.summary.successCount}
                  </p>
                </div>
                <div className="bg-card/50 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground mb-1">Failed</p>
                  <p className="text-2xl font-bold text-red-600">
                    {translationProgress.summary.failedCount}
                  </p>
                </div>
              </div>
            )}

            {translationProgress.message && (
              <p className="text-sm text-muted-foreground mt-4">{translationProgress.message}</p>
            )}
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

        {/* Category Browser */}
        {stats && stats.categories.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-lg mt-6">
            <h3 className="text-xl font-bold text-foreground mb-4">Category Browser</h3>

            {/* Tabs */}
            <div className="flex gap-2 mb-4 border-b border-border">
              <button
                onClick={() => {setCategoryTab('database'); setSelectedCategory(null); setSelectedConsolidated(null); setCategoryVideos([]); setVideoPage(1); setVideoSearchQuery('')}}
                className={`px-4 py-2 font-medium transition-all ${
                  categoryTab === 'database'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ListIcon className="w-4 h-4 inline mr-2" />
                Database ({stats.categories.length})
              </button>
              <button
                onClick={() => {setCategoryTab('consolidated'); setSelectedCategory(null); setSelectedConsolidated(null); setCategoryVideos([]); setVideoPage(1); setVideoSearchQuery('')}}
                className={`px-4 py-2 font-medium transition-all ${
                  categoryTab === 'consolidated'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Grid className="w-4 h-4 inline mr-2" />
                Consolidated ({CONSOLIDATED_CATEGORIES.length})
              </button>
            </div>

            {/* Global Search */}
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                placeholder="Search all videos..."
                value={globalVideoSearchQuery}
                onChange={(e) => {
                  setGlobalVideoSearchQuery(e.target.value)
                  setGlobalSearchPage(1)
                }}
                className="flex-1 px-4 py-2 bg-muted text-foreground rounded border border-border focus:border-primary focus:outline-none text-sm"
              />
              <button
                onClick={async () => {
                  if (!globalVideoSearchQuery.trim()) {
                    setGlobalSearchResults([])
                    setGlobalSearchTotalCount(0)
                    return
                  }
                  setLoadingGlobalSearch(true)
                  try {
                    const res = await fetch(`/api/admin/videos/by-category?search=${encodeURIComponent(globalVideoSearchQuery)}&page=1`)
                    const data = await res.json()
                    setGlobalSearchResults(data.list || [])
                    setGlobalSearchTotalCount(data.total || 0)
                    setGlobalSearchPage(1)
                  } catch (error) {
                    console.error('Global search failed:', error)
                    setGlobalSearchResults([])
                    setGlobalSearchTotalCount(0)
                  } finally {
                    setLoadingGlobalSearch(false)
                  }
                }}
                className="px-6 py-2 bg-primary text-primary-foreground rounded hover:opacity-80 transition-opacity font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loadingGlobalSearch}
              >
                {loadingGlobalSearch ? 'Searching...' : 'Search'}
              </button>
            </div>

            {/* Show search results or category browser */}
            {globalSearchResults.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-screen">
                {/* Left panel - Search info */}
                <div className="lg:col-span-1 border border-border rounded-lg overflow-hidden bg-muted/30 flex flex-col">
                  <div className="px-4 py-3 border-b border-border bg-muted/50">
                    <p className="text-sm font-semibold text-foreground">Search Results</p>
                    <p className="text-xs text-muted-foreground mt-1">{globalSearchTotalCount} videos found</p>
                  </div>
                  <div className="overflow-y-auto flex-1 p-4">
                    <p className="text-xs text-muted-foreground">Showing results for:</p>
                    <p className="text-sm font-medium text-foreground mt-2 break-words">{globalVideoSearchQuery}</p>
                    <button
                      onClick={() => {
                        setGlobalVideoSearchQuery('')
                        setGlobalSearchResults([])
                        setGlobalSearchTotalCount(0)
                      }}
                      className="mt-4 w-full px-3 py-2 text-xs bg-muted hover:bg-muted/80 text-foreground rounded transition-colors"
                    >
                      Clear Search
                    </button>
                  </div>
                </div>

                {/* Right panel - Videos */}
                <div className="lg:col-span-2 border border-border rounded-lg bg-muted/30 flex flex-col h-full">
                  <div className="bg-muted/50 px-4 py-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setSelectAllSearchVideos(!selectAllSearchVideos)
                          if (!selectAllSearchVideos) {
                            const allIds = new Set(globalPaginatedVideos.map(v => v.vod_id))
                            setSelectedSearchVideoIds(allIds)
                          } else {
                            setSelectedSearchVideoIds(new Set())
                          }
                        }}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
                          selectAllSearchVideos
                            ? 'bg-primary border-primary'
                            : 'border-muted-foreground/30 hover:border-muted-foreground/60'
                        }`}
                        title="Select all videos on this page"
                      >
                        {selectAllSearchVideos && <Check className="w-3 h-3 text-primary-foreground" />}
                      </button>
                      <h4 className="font-semibold text-foreground">
                        {globalSearchTotalCount} videos found
                        {selectedSearchVideoIds.size > 0 && <span className="text-primary ml-2">({selectedSearchVideoIds.size} selected)</span>}
                      </h4>
                    </div>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    <div className="divide-y divide-border">
                      {globalPaginatedVideos.map((video) => (
                        <div
                          key={video.vod_id}
                          className={`px-3 py-2 hover:bg-muted/50 transition-colors ${
                            selectedSearchVideoIds.has(video.vod_id) ? 'bg-primary/10' : ''
                          }`}
                        >
                          <div className="flex gap-2 items-start justify-between">
                            <div className="flex gap-2 flex-1 min-w-0 items-start">
                              <button
                                onClick={() => {
                                  const newSelected = new Set(selectedSearchVideoIds)
                                  if (!newSelected.has(video.vod_id)) {
                                    newSelected.add(video.vod_id)
                                  } else {
                                    newSelected.delete(video.vod_id)
                                  }
                                  setSelectedSearchVideoIds(newSelected)
                                  setSelectAllSearchVideos(newSelected.size === globalPaginatedVideos.length)
                                }}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0 mt-1 ${
                                  selectedSearchVideoIds.has(video.vod_id)
                                    ? 'bg-primary border-primary'
                                    : 'border-muted-foreground/30 hover:border-muted-foreground/60'
                                }`}
                              >
                                {selectedSearchVideoIds.has(video.vod_id) && <Check className="w-3 h-3 text-primary-foreground" />}
                              </button>
                              {video.vod_pic && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={video.vod_pic}
                                  alt={video.vod_name}
                                  className="w-20 aspect-video rounded object-cover flex-shrink-0"
                                />
                              )}
                              <div className="min-w-0 flex-1 flex flex-col justify-center">
                                <p className="text-sm font-medium text-foreground line-clamp-1">{video.vod_name}</p>
                                <div className="flex gap-2 text-xs text-muted-foreground">
                                  <span>{video.vod_hits?.toLocaleString() || 0} views</span>
                                  {video.type_name && <span>•</span>}
                                  {video.type_name && <span>{video.type_name}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <a
                                href={`/watch/${video.vod_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors"
                                title="View video"
                              >
                                <Eye className="w-4 h-4" />
                              </a>
                              <button
                                onClick={async () => {
                                  if (confirm('Delete this video?')) {
                                    try {
                                      await fetch(`/api/admin/videos/${video.vod_id}`, { method: 'DELETE' })
                                      setGlobalSearchResults(prev => prev.filter(v => v.vod_id !== video.vod_id))
                                      setSelectedSearchVideoIds(prev => {
                                        const newSet = new Set(prev)
                                        newSet.delete(video.vod_id)
                                        return newSet
                                      })
                                    } catch (error) {
                                      console.error('Failed to delete video:', error)
                                    }
                                  }
                                }}
                                className="p-1.5 rounded hover:bg-red-500/10 text-red-600 transition-colors"
                                title="Delete video"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bulk actions */}
                  {selectedSearchVideoIds.size > 0 && (
                    <div className="px-4 py-3 border-t border-border bg-muted/50 flex gap-2 flex-wrap">
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete ${selectedSearchVideoIds.size} selected videos?`)) return
                          setDeletingAllSearch(true)
                          try {
                            const ids = Array.from(selectedSearchVideoIds)
                            await fetch('/api/admin/videos/bulk', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ ids }),
                            })
                            setGlobalSearchResults(prev => prev.filter(v => !selectedSearchVideoIds.has(v.vod_id)))
                            setSelectedSearchVideoIds(new Set())
                            setSelectAllSearchVideos(false)
                          } catch (error) {
                            console.error('Failed to delete videos:', error)
                          } finally {
                            setDeletingAllSearch(false)
                          }
                        }}
                        disabled={deletingAllSearch}
                        className="px-3 py-2 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {deletingAllSearch ? 'Deleting...' : `Delete Selected (${selectedSearchVideoIds.size})`}
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete ALL ${globalSearchTotalCount} videos from this search? This action cannot be undone!`)) return
                          setDeletingAllSearch(true)
                          try {
                            // Fetch all video IDs from all pages
                            const allVideoIds: string[] = []
                            const totalPages = Math.ceil(globalSearchTotalCount / 20)
                            for (let page = 1; page <= totalPages; page++) {
                              const res = await fetch(`/api/admin/videos/by-category?search=${encodeURIComponent(globalVideoSearchQuery)}&page=${page}`)
                              const data = await res.json()
                              allVideoIds.push(...(data.list || []).map((v: MaccmsVideo) => v.vod_id))
                            }
                            // Delete all videos in one batch
                            if (allVideoIds.length > 0) {
                              await fetch('/api/admin/videos/bulk', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ids: allVideoIds }),
                              })
                            }
                            setGlobalSearchResults([])
                            setGlobalSearchTotalCount(0)
                            setSelectedSearchVideoIds(new Set())
                            setSelectAllSearchVideos(false)
                            setGlobalVideoSearchQuery('')
                          } catch (error) {
                            console.error('Failed to delete all videos:', error)
                          } finally {
                            setDeletingAllSearch(false)
                          }
                        }}
                        disabled={deletingAllSearch}
                        className="px-3 py-2 text-xs bg-red-700 text-white rounded hover:bg-red-800 disabled:opacity-50 transition-colors"
                      >
                        {deletingAllSearch ? 'Deleting All...' : `Delete All ${globalSearchTotalCount} Videos`}
                      </button>
                    </div>
                  )}
                  {globalTotalPages > 1 && (
                    <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-between w-full flex-shrink-0">
                      <span className="text-xs text-muted-foreground">{globalSearchPage} / {globalTotalPages}</span>
                      <div className="flex gap-2 items-center text-xs">
                        <button
                          onClick={async () => {
                            const newPage = Math.max(1, globalSearchPage - 1)
                            setGlobalLoadingPage(true)
                            try {
                              const res = await fetch(`/api/admin/videos/by-category?search=${encodeURIComponent(globalVideoSearchQuery)}&page=${newPage}`)
                              const data = await res.json()
                              setGlobalSearchResults(data.list || [])
                              setGlobalSearchPage(newPage)
                            } catch (error) {
                              console.error('Failed to fetch page:', error)
                            } finally {
                              setGlobalLoadingPage(false)
                            }
                          }}
                          disabled={globalSearchPage === 1 || globalLoadingPage}
                          className="px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          ← Prev
                        </button>
                        <button
                          onClick={async () => {
                            const newPage = Math.min(globalTotalPages, globalSearchPage + 1)
                            setGlobalLoadingPage(true)
                            try {
                              const res = await fetch(`/api/admin/videos/by-category?search=${encodeURIComponent(globalVideoSearchQuery)}&page=${newPage}`)
                              const data = await res.json()
                              setGlobalSearchResults(data.list || [])
                              setGlobalSearchPage(newPage)
                            } catch (error) {
                              console.error('Failed to fetch page:', error)
                            } finally {
                              setGlobalLoadingPage(false)
                            }
                          }}
                          disabled={globalSearchPage === globalTotalPages || globalLoadingPage}
                          className="px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-screen">
              {/* Categories List */}
              <div className="lg:col-span-1 border border-border rounded-lg overflow-hidden bg-muted/30 flex flex-col">
                <div className="px-4 py-3 border-b border-border bg-muted/50">
                  <input
                    type="text"
                    placeholder="Search categories..."
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                    className="w-full px-3 py-2 bg-muted text-foreground rounded border border-border focus:border-primary focus:outline-none text-sm"
                  />
                </div>
                <div className="overflow-y-auto flex-1">
                  {categoryTab === 'database' ? (
                    // Database categories
                    <div className="divide-y divide-border">
                      {filteredCategories
                        .sort((a, b) => b._count - a._count)
                        .map((cat, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSelectDatabaseCategory(cat.typeName)}
                            className={`w-full text-left px-4 py-3 hover:bg-muted transition-colors ${
                              selectedCategory === cat.typeName ? 'bg-primary/10' : ''
                            }`}
                          >
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">{cat.typeName}</span>
                              <span className="text-xs bg-muted px-2 py-1 rounded whitespace-nowrap font-bold">
                                {cat._count.toLocaleString()}
                              </span>
                            </div>
                          </button>
                        ))}
                    </div>
                  ) : (
                    // Consolidated categories
                    <div className="divide-y divide-border">
                      {CONSOLIDATED_CATEGORIES
                        .filter(cat =>
                          cat.toLowerCase().includes(categorySearchQuery.toLowerCase()) ||
                          CONSOLIDATED_TO_CHINESE[cat].toLowerCase().includes(categorySearchQuery.toLowerCase())
                        )
                        .map(cat => {
                          const variants = getVariantsForConsolidated(cat)
                          const count = stats.categories
                            .filter(db => variants.includes(db.typeName.toLowerCase()))
                            .reduce((sum, db) => sum + db._count, 0)
                          return { cat, count, variants }
                        })
                        .sort((a, b) => b.count - a.count)
                        .map((item, idx) => (
                          <div key={idx} className="border-b border-border last:border-b-0">
                            <button
                              onClick={() => handleSelectConsolidatedCategory(item.cat, CONSOLIDATED_TYPE_IDS[item.cat])}
                              className={`w-full text-left px-4 py-3 hover:bg-muted transition-colors flex justify-between items-center gap-2 ${
                                selectedCategory?.includes(item.cat) ? 'bg-primary/10' : ''
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-foreground">{CONSOLIDATED_TO_CHINESE[item.cat]}</p>
                                <p className="text-xs text-muted-foreground capitalize">{item.cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</p>
                              </div>
                              <span className="text-xs bg-muted px-2 py-1 rounded whitespace-nowrap font-bold">
                                {item.count.toLocaleString()}
                              </span>
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Videos/Variants Preview */}
              <div className="lg:col-span-2 border border-border rounded-lg bg-muted/30 flex flex-col h-full">
                <div className="bg-muted/50 px-4 py-4 border-b border-border">
                  <div className="flex justify-between items-center gap-4">
                    <h4 className="font-semibold text-foreground">
                      {selectedCategory ? selectedCategory : 'Select a category'}
                    </h4>
                    {selectedConsolidated && categoryTab === 'consolidated' && (
                      <div className="flex gap-2 text-sm">
                        <button
                          onClick={() => {setRightPanelTab('videos'); setExpandedVariantDropdown(false)}}
                          className={`px-3 py-1 rounded transition-colors ${
                            rightPanelTab === 'videos'
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          Videos
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => setExpandedVariantDropdown(!expandedVariantDropdown)}
                            className={`px-3 py-1 rounded transition-colors flex items-center gap-1 ${
                              rightPanelTab === 'variants'
                                ? 'bg-primary text-primary-foreground'
                                : 'hover:bg-muted text-muted-foreground'
                            }`}
                          >
                            Variants ({selectedConsolidated.variants.length})
                            <ChevronDown className={`w-3 h-3 transition-transform ${expandedVariantDropdown ? 'rotate-180' : ''}`} />
                          </button>
                          {expandedVariantDropdown && (
                            <div className="absolute right-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                              {selectedConsolidated.variants
                                .sort((a, b) => {
                                  const countA = stats?.categories.find(c => c.typeName.toLowerCase() === a)?._count || 0
                                  const countB = stats?.categories.find(c => c.typeName.toLowerCase() === b)?._count || 0
                                  return countB - countA
                                })
                                .map((variant, idx) => {
                                  const variantCount = stats?.categories.find(c => c.typeName.toLowerCase() === variant)?._count || 0
                                  const capitalizedVariant = variant.charAt(0).toUpperCase() + variant.slice(1)
                                  return (
                                    <button
                                      key={idx}
                                      onClick={() => {
                                        handleSelectVariant(variant)
                                        setExpandedVariantDropdown(false)
                                      }}
                                      className="w-full text-left px-4 py-2 hover:bg-muted transition-colors flex justify-between items-center border-b border-border last:border-b-0"
                                    >
                                      <span className="text-sm text-foreground">{capitalizedVariant}</span>
                                      <span className="text-xs font-bold text-primary">{variantCount.toLocaleString()}</span>
                                    </button>
                                  )
                                })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col h-full">
                  {rightPanelTab === 'videos' && categoryVideos.length > 0 && (
                    <div className="px-4 py-3 border-b border-border bg-muted/30">
                      <input
                        type="text"
                        placeholder="Search videos..."
                        value={videoSearchQuery}
                        onChange={(e) => {
                          setVideoSearchQuery(e.target.value)
                          setVideoPage(1)
                        }}
                        className="w-full px-3 py-2 bg-muted text-foreground rounded border border-border focus:border-primary focus:outline-none text-sm"
                      />
                    </div>
                  )}
                  <div className="overflow-y-auto flex-1 flex flex-col">
                    {rightPanelTab === 'videos' ? (
                      // Videos tab
                      <>
                        {loadingCategoryVideos ? (
                          <div className="divide-y divide-border">
                            {Array.from({ length: 5 }).map((_, idx) => (
                              <div key={idx} className="px-3 py-2">
                                <div className="flex gap-2 items-start justify-between">
                                  <div className="flex gap-2 flex-1 min-w-0">
                                    <div className="w-20 aspect-video rounded bg-muted animate-pulse flex-shrink-0" />
                                    <div className="flex-1 space-y-1">
                                      <div className="h-4 bg-muted rounded animate-pulse" />
                                      <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
                                    </div>
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <div className="w-6 h-6 bg-muted rounded animate-pulse" />
                                    <div className="w-6 h-6 bg-muted rounded animate-pulse" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : categoryVideos.length > 0 ? (
                          <>
                            {filteredVideos.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">No videos match your search</div>
                            ) : (
                              <div className="divide-y divide-border">
                                {videosToDisplay.map((video) => (
                            <div key={video.vod_id} className="px-3 py-2 hover:bg-muted/50 transition-colors">
                              <div className="flex gap-2 items-start justify-between">
                                <div className="flex gap-2 flex-1 min-w-0">
                                  {video.vod_pic && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={video.vod_pic}
                                      alt={video.vod_name}
                                      className="w-20 aspect-video rounded object-cover flex-shrink-0"
                                    />
                                  )}
                                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                                    <p className="text-sm font-medium text-foreground line-clamp-1">{video.vod_name}</p>
                                    <div className="flex gap-2 text-xs text-muted-foreground">
                                      <span>{video.vod_hits?.toLocaleString() || 0} views</span>
                                      {video.type_name && <span>•</span>}
                                      {video.type_name && <span>{video.type_name}</span>}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                  <a
                                    href={`/watch/${video.vod_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors"
                                    title="View video"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </a>
                                  <button
                                    onClick={async () => {
                                      if (confirm('Delete this video?')) {
                                        try {
                                          await fetch(`/api/admin/videos/${video.vod_id}`, { method: 'DELETE' })
                                          setCategoryVideos(prev => prev.filter(v => v.vod_id !== video.vod_id))
                                        } catch (error) {
                                          console.error('Failed to delete video:', error)
                                        }
                                      }
                                    }}
                                    className="p-1.5 rounded hover:bg-red-500/10 text-red-600 transition-colors"
                                    title="Delete video"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="p-8 text-center text-muted-foreground">
                            {selectedCategory ? 'No videos found' : 'Select a category to view videos'}
                          </div>
                        )}
                      </>
                    ) : (
                      // Variants tab (consolidated only)
                    <div className="divide-y divide-border">
                      {selectedConsolidated?.variants
                        .sort((a, b) => {
                          const countA = stats?.categories.find(c => c.typeName.toLowerCase() === a)?._count || 0
                          const countB = stats?.categories.find(c => c.typeName.toLowerCase() === b)?._count || 0
                          return countB - countA
                        })
                        .map((variant, vidx) => {
                          const variantCount = stats?.categories.find(c => c.typeName.toLowerCase() === variant)?._count || 0
                          const capitalizedVariant = variant.charAt(0).toUpperCase() + variant.slice(1)
                          return (
                            <div key={vidx} className="px-4 py-3 hover:bg-muted/50 transition-colors flex justify-between items-center">
                              <span className="text-sm font-medium text-foreground truncate">{capitalizedVariant}</span>
                              <span className="text-sm font-bold text-primary ml-2 whitespace-nowrap">{variantCount.toLocaleString()}</span>
                            </div>
                          )
                        })}
                    </div>
                  )}
                  </div>
                  {rightPanelTab === 'videos' && categoryVideos.length > 0 && (
                    <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-between w-full flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {videoSearchQuery ? `${filteredVideos.length} found` : `${selectedCategoryCount.toLocaleString()} total`}
                      </span>
                      {categoryTotalPages > 1 ? (
                        <div className="flex gap-2 items-center text-xs">
                          <button
                            onClick={async () => {
                              const newPage = Math.max(1, videoPage - 1)
                              setLoadingCategoryVideos(true)
                              try {
                                let url = ''
                                if (selectedConsolidated) {
                                  const variantParams = selectedConsolidated.variants.map(v => `variants=${encodeURIComponent(v)}`).join('&')
                                  url = `/api/admin/videos/by-category?${variantParams}&page=${newPage}`
                                } else {
                                  url = `/api/admin/videos/by-category?category=${encodeURIComponent(selectedCategory || '')}&page=${newPage}`
                                }
                                const res = await fetch(url)
                                const data = await res.json()
                                setCategoryVideos(data.list || [])
                                setVideoPage(newPage)
                              } catch (error) {
                                console.error('Failed to fetch page:', error)
                              } finally {
                                setLoadingCategoryVideos(false)
                              }
                            }}
                            disabled={videoPage === 1}
                            className="px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            ← Prev
                          </button>
                          <span className="text-xs text-muted-foreground">
                            {videoPage} / {categoryTotalPages}
                            <button onClick={() => console.log('Debug:', {videoPage, categoryTotalPages, selectedConsolidated})} className="ml-2 text-xs opacity-50">?</button>
                          </span>
                          <button
                            onClick={async () => {
                              const newPage = Math.min(categoryTotalPages, videoPage + 1)
                              setLoadingCategoryVideos(true)
                              try {
                                let url = ''
                                if (selectedConsolidated) {
                                  const variantParams = selectedConsolidated.variants.map(v => `variants=${encodeURIComponent(v)}`).join('&')
                                  url = `/api/admin/videos/by-category?${variantParams}&page=${newPage}`
                                } else {
                                  url = `/api/admin/videos/by-category?category=${encodeURIComponent(selectedCategory || '')}&page=${newPage}`
                                }
                                const res = await fetch(url)
                                const data = await res.json()
                                setCategoryVideos(data.list || [])
                                setVideoPage(newPage)
                              } catch (error) {
                                console.error('Failed to fetch page:', error)
                              } finally {
                                setLoadingCategoryVideos(false)
                              }
                            }}
                            disabled={videoPage === categoryTotalPages}
                            className="px-2 py-1 text-xs rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Next →
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Page 1 of 1
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
