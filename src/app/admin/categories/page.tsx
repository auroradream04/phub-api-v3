'use client'

import { useState, useEffect } from 'react'
import { Database, Grid, List, Trash2, CheckSquare, Square } from 'lucide-react'
import {
  CONSOLIDATED_CATEGORIES,
  CONSOLIDATED_TO_CHINESE,
  CONSOLIDATED_TYPE_IDS,
  getVariantsForConsolidated
} from '@/lib/maccms-mappings'

interface CategoryStats {
  typeName: string
  count: number
}

interface ConsolidatedStats {
  consolidated: string
  chinese: string
  typeId: number
  count: number
  variants: string[]
}

interface MaccmsVideo {
  vod_id: string
  vod_name: string
  vod_pic?: string
  vod_hits?: number
  type_name?: string
}

export default function CategoriesAdmin() {
  const [activeTab, setActiveTab] = useState<'database' | 'consolidated'>('database')
  const [databaseCategories, setDatabaseCategories] = useState<CategoryStats[]>([])
  const [consolidatedCategories, setConsolidatedCategories] = useState<ConsolidatedStats[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [categoryVideos, setCategoryVideos] = useState<MaccmsVideo[]>([])
  const [loadingVideos, setLoadingVideos] = useState(false)
  const [totalVideos, setTotalVideos] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Fetch database categories on load
  useEffect(() => {
    fetchDatabaseCategories()
    buildConsolidatedCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchDatabaseCategories = async () => {
    try {
      const res = await fetch('/api/scraper/videos')
      const data = await res.json() as { categories: Array<{ typeName: string; _count: number }>; totalVideos: number }
      if (data.categories) {
        const sorted = data.categories.sort((a, b) => b._count - a._count)
        setDatabaseCategories(sorted.map((cat) => ({
          typeName: cat.typeName,
          count: cat._count
        })))
        setTotalVideos(data.totalVideos)
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error)
    }
  }

  const buildConsolidatedCategories = () => {
    const consolidated: ConsolidatedStats[] = CONSOLIDATED_CATEGORIES.map(cat => {
      const variants = getVariantsForConsolidated(cat)
      const count = databaseCategories
        .filter(db => variants.includes(db.typeName.toLowerCase()))
        .reduce((sum, db) => sum + db.count, 0)

      return {
        consolidated: cat,
        chinese: CONSOLIDATED_TO_CHINESE[cat],
        typeId: CONSOLIDATED_TYPE_IDS[cat],
        count: count,
        variants: variants
      }
    })

    setConsolidatedCategories(consolidated.sort((a, b) => b.count - a.count))
  }

  // Fetch videos for selected category
  const handleSelectDatabase = async (categoryName: string) => {
    setSelectedCategory(categoryName)
    setSearchQuery('')
    setSelectedVideos(new Set())
    setLoadingVideos(true)
    try {
      const res = await fetch(
        `/api/provide/vod?ac=list&wd=${encodeURIComponent(categoryName)}&pagesize=50`
      )
      const data = await res.json()
      setCategoryVideos(data.list || [])
    } catch (error) {
      console.error('Failed to fetch videos:', error)
      setCategoryVideos([])
    } finally {
      setLoadingVideos(false)
    }
  }

  const handleSelectConsolidated = async (consolidated: string, typeId: number) => {
    setSelectedCategory(`${consolidated} (${typeId})`)
    setSearchQuery('')
    setSelectedVideos(new Set())
    setLoadingVideos(true)
    try {
      const res = await fetch(
        `/api/provide/vod?ac=list&t=${typeId}&pagesize=50`
      )
      const data = await res.json()
      setCategoryVideos(data.list || [])
    } catch (error) {
      console.error('Failed to fetch videos:', error)
      setCategoryVideos([])
    } finally {
      setLoadingVideos(false)
    }
  }

  const handleVideoCheckbox = (index: number, vodId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const newSelected = new Set(selectedVideos)

    // Shift+click for range selection
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      for (let i = start; i <= end; i++) {
        newSelected.add(categoryVideos[i]!.vod_id)
      }
    } else {
      // Regular click
      if (newSelected.has(vodId)) {
        newSelected.delete(vodId)
      } else {
        newSelected.add(vodId)
      }
    }

    setSelectedVideos(newSelected)
    setLastSelectedIndex(index)
  }

  const handleSelectAll = () => {
    if (selectedVideos.size === categoryVideos.length) {
      setSelectedVideos(new Set())
    } else {
      setSelectedVideos(new Set(categoryVideos.map(v => v.vod_id)))
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedVideos.size === 0) return
    if (!confirm(`Delete ${selectedVideos.size} videos? This cannot be undone.`)) return

    setDeleting(true)
    try {
      for (const vodId of selectedVideos) {
        await fetch(`/api/admin/videos/${vodId}`, { method: 'DELETE' })
      }
      // Refresh videos
      setCategoryVideos(categoryVideos.filter(v => !selectedVideos.has(v.vod_id)))
      setSelectedVideos(new Set())
    } catch (error) {
      console.error('Failed to delete videos:', error)
      alert('Failed to delete some videos')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
            <Database className="w-8 h-8" />
            Category Browser
          </h1>
          <p className="text-slate-400">View database categories and consolidated categories</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b border-slate-700">
          <button
            onClick={() => setActiveTab('database')}
            className={`px-6 py-3 font-medium transition-all ${
              activeTab === 'database'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <List className="w-4 h-4 inline mr-2" />
            Database Categories ({databaseCategories.length})
          </button>
          <button
            onClick={() => setActiveTab('consolidated')}
            className={`px-6 py-3 font-medium transition-all ${
              activeTab === 'consolidated'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <Grid className="w-4 h-4 inline mr-2" />
            Consolidated Categories ({consolidatedCategories.length})
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Categories List */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden flex flex-col">
              <div className="bg-slate-700 px-4 py-3 border-b border-slate-600">
                <h2 className="font-semibold text-white">
                  {activeTab === 'database' ? 'Database Categories' : 'Consolidated Categories'}
                </h2>
              </div>

              {/* Search Box */}
              <div className="px-4 py-3 border-b border-slate-600 bg-slate-800">
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="max-h-[550px] overflow-y-auto flex-1">
                {activeTab === 'database' ? (
                  // Database Categories
                  <div className="divide-y divide-slate-700">
                    {databaseCategories
                      .filter(cat => cat.typeName.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((cat, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectDatabase(cat.typeName)}
                        className={`w-full text-left px-4 py-3 transition-colors hover:bg-slate-700 ${
                          selectedCategory === cat.typeName ? 'bg-blue-900' : ''
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-white font-medium text-sm">{cat.typeName}</p>
                          </div>
                          <span className="text-xs bg-slate-600 px-2 py-1 rounded">
                            {cat.count.toLocaleString()}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  // Consolidated Categories
                  <div className="divide-y divide-slate-700">
                    {consolidatedCategories
                      .filter(cat =>
                        cat.chinese.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        cat.consolidated.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((cat, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectConsolidated(cat.consolidated, cat.typeId)}
                        className={`w-full text-left px-4 py-3 transition-colors hover:bg-slate-700 ${
                          selectedCategory?.includes(cat.consolidated) ? 'bg-blue-900' : ''
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1">
                            <p className="text-white font-medium text-sm">{cat.chinese}</p>
                            <p className="text-xs text-slate-400">{cat.consolidated}</p>
                            {cat.variants.length > 1 && (
                              <p className="text-xs text-slate-500 mt-1">
                                {cat.variants.length} variants
                              </p>
                            )}
                          </div>
                          <span className="text-xs bg-slate-600 px-2 py-1 rounded whitespace-nowrap">
                            {cat.count.toLocaleString()}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Videos List */}
          <div className="lg:col-span-2">
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden flex flex-col">
              <div className="bg-slate-700 px-4 py-3 border-b border-slate-600">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h2 className="font-semibold text-white">
                      {selectedCategory ? `Videos: ${selectedCategory}` : 'Select a category'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      {loadingVideos ? 'Loading...' : `${categoryVideos.length} videos${selectedVideos.size > 0 ? ` (${selectedVideos.size} selected)` : ''}`}
                    </p>
                  </div>
                  {categoryVideos.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleSelectAll}
                        className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center gap-1"
                      >
                        {selectedVideos.size === categoryVideos.length ? (
                          <>
                            <CheckSquare className="w-4 h-4" />
                            Deselect All
                          </>
                        ) : (
                          <>
                            <Square className="w-4 h-4" />
                            Select All
                          </>
                        )}
                      </button>
                      {selectedVideos.size > 0 && (
                        <button
                          onClick={handleDeleteSelected}
                          disabled={deleting}
                          className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded flex items-center gap-1 disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete ({selectedVideos.size})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="max-h-[550px] overflow-y-auto flex-1">
                {loadingVideos ? (
                  <div className="p-8 text-center text-slate-400">Loading videos...</div>
                ) : categoryVideos.length > 0 ? (
                  <div className="divide-y divide-slate-700">
                    {categoryVideos.map((video, idx) => (
                      <div
                        key={idx}
                        className={`px-4 py-3 hover:bg-slate-700 transition-colors cursor-pointer ${
                          selectedVideos.has(video.vod_id) ? 'bg-slate-700' : ''
                        }`}
                        onClick={(e) => {
                          if (!(e.target as HTMLElement).closest('button')) {
                            handleVideoCheckbox(idx, video.vod_id, e as unknown as React.MouseEvent)
                          }
                        }}
                      >
                        <div className="flex gap-3">
                          <button
                            onClick={(e) => handleVideoCheckbox(idx, video.vod_id, e)}
                            className="mt-1 flex-shrink-0"
                          >
                            {selectedVideos.has(video.vod_id) ? (
                              <CheckSquare className="w-5 h-5 text-blue-400" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-500" />
                            )}
                          </button>
                          {video.vod_pic && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={video.vod_pic}
                              alt={video.vod_name}
                              className="w-16 h-20 rounded object-cover flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-sm line-clamp-2">
                              {video.vod_name}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              {video.vod_hits?.toLocaleString() || 0} views
                            </p>
                            {video.type_name && (
                              <p className="text-xs text-slate-500 mt-1">{video.type_name}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400">
                    {selectedCategory ? 'No videos found' : 'Select a category to view videos'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <p className="text-slate-400 text-sm">Total Videos</p>
            <p className="text-2xl font-bold text-white mt-1">{totalVideos.toLocaleString()}</p>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <p className="text-slate-400 text-sm">Database Categories</p>
            <p className="text-2xl font-bold text-white mt-1">{databaseCategories.length}</p>
          </div>
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <p className="text-slate-400 text-sm">Consolidated Categories</p>
            <p className="text-2xl font-bold text-white mt-1">{consolidatedCategories.length}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
