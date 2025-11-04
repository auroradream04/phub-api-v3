'use client'

import { useState, useEffect } from 'react'
import { Database, Grid, List } from 'lucide-react'
import {
  CONSOLIDATED_CATEGORIES,
  CONSOLIDATED_TO_CHINESE,
  CONSOLIDATED_TYPE_IDS,
  DATABASE_TO_CONSOLIDATED,
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

  // Fetch database categories on load
  useEffect(() => {
    fetchDatabaseCategories()
    buildConsolidatedCategories()
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
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <div className="bg-slate-700 px-4 py-3 border-b border-slate-600">
                <h2 className="font-semibold text-white">
                  {activeTab === 'database' ? 'Database Categories' : 'Consolidated Categories'}
                </h2>
              </div>

              <div className="max-h-[600px] overflow-y-auto">
                {activeTab === 'database' ? (
                  // Database Categories
                  <div className="divide-y divide-slate-700">
                    {databaseCategories.map((cat, idx) => (
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
                    {consolidatedCategories.map((cat, idx) => (
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
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
              <div className="bg-slate-700 px-4 py-3 border-b border-slate-600">
                <h2 className="font-semibold text-white">
                  {selectedCategory ? `Videos: ${selectedCategory}` : 'Select a category'}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {loadingVideos ? 'Loading...' : `${categoryVideos.length} videos`}
                </p>
              </div>

              <div className="max-h-[600px] overflow-y-auto">
                {loadingVideos ? (
                  <div className="p-8 text-center text-slate-400">Loading videos...</div>
                ) : categoryVideos.length > 0 ? (
                  <div className="divide-y divide-slate-700">
                    {categoryVideos.map((video, idx) => (
                      <div key={idx} className="px-4 py-3 hover:bg-slate-700 transition-colors">
                        <div className="flex gap-3">
                          {video.vod_pic && (
                            <img
                              src={video.vod_pic}
                              alt={video.vod_name}
                              className="w-16 h-20 rounded object-cover"
                            />
                          )}
                          <div className="flex-1">
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
