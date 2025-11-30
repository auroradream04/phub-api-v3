'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { encryptEmbedId } from '@/lib/embed-encryption'
import { Copy, Eye, Trash2, Edit, Play } from 'lucide-react'
import { BulkVideoExtractor } from '@/components/admin/bulk-video-extractor'

interface VideoEmbed {
  id: string
  videoId: string
  title: string
  displayName?: string
  redirectUrl: string
  enabled: boolean
  createdAt: string
  previewM3u8Path?: string
  previewSegmentDir?: string
  previewDownloadedAt?: string
  previewSourceUrl?: string
  _count?: { analytics: number }
  impressions?: number
  clicks?: number
}

interface SearchVideo {
  id: string
  videoId: string
  title: string
  preview: string
  previewVideo?: string
  url: string
}

interface ExtractedVideo {
  inputLink: string
  viewkey: string
  title: string
  preview: string
  previewVideo?: string
  videoId: string
  error?: string
}

interface EmbedResponse {
  data: VideoEmbed[]
  total: number
  pages: number
}

interface SearchResponse {
  videos: SearchVideo[]
  paging?: Record<string, unknown>
  counting?: Record<string, unknown>
}

export default function EmbedsClient() {
  const [activeTab, setActiveTab] = useState<'manage' | 'bulk'>('manage')
  const [embeds, setEmbeds] = useState<VideoEmbed[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [videoSearch, setVideoSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchVideo[]>([])
  const [searching, setSearching] = useState(false)
  const [_selectedVideo, setSelectedVideo] = useState<SearchVideo | null>(null)
  const [manualVideoInput, setManualVideoInput] = useState('')
  const [fetchingManualVideo, setFetchingManualVideo] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const manualTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const [formData, setFormData] = useState({
    videoId: '',
    title: '',
    redirectUrl: '',
    displayName: '',
    previewSourceUrl: '',
    m3u8Url: '',
  })

  const isVideoUrl = (url: string) => {
    return url && (url.includes('.webm') || url.includes('.mp4') || url.includes('.m3u8'))
  }

  const isDirectVideoUrl = (input: string) => {
    try {
      return input && (input.includes('.webm') || input.includes('.mp4') || input.includes('.m3u8'))
    } catch {
      return false
    }
  }

  useEffect(() => {
    fetchEmbeds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search])

  async function fetchEmbeds() {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(search && { search }),
      })

      const res = await fetch(`/api/admin/embeds?${params}`)
      const data: EmbedResponse = await res.json()

      setEmbeds(data.data)
      setTotal(data.total)
    } catch {

    } finally {
      setLoading(false)
    }
  }

  function handleSearchVideosDebounced(query: string) {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (query.length >= 2) {
      setSearching(true)
    } else {
      setSearching(false)
      setSearchResults([])
      return
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          page: '1',
        })

        const res = await fetch(`/api/admin/embeds/search-video?${params}`)
        if (!res.ok) {

          setSearching(false)
          return
        }

        const data: SearchResponse = await res.json()
        setSearchResults(data.videos)
      } catch {

      } finally {
        setSearching(false)
      }
    }, 1000)
  }

  function handleSelectVideo(video: SearchVideo) {
    setSelectedVideo(video)
    setFormData({
      videoId: video.videoId,
      title: video.title,
      redirectUrl: '',
      displayName: '',
      previewSourceUrl: video.videoId,
      m3u8Url: '',
    })
  }

  function handleSelectBulkVideo(video: ExtractedVideo) {
    setFormData({
      videoId: video.videoId,
      title: video.title,
      redirectUrl: '',
      displayName: '',
      previewSourceUrl: video.videoId,
      m3u8Url: video.inputLink,
    })
    setShowCreateModal(true)
    setManualVideoInput(video.inputLink)
    setSelectedVideo({
      id: video.videoId,
      videoId: video.videoId,
      title: video.title,
      preview: video.preview,
      previewVideo: video.previewVideo,
      url: video.inputLink,
    })
  }

  function _handleFetchManualVideoDebounced(input: string) {
    if (manualTimeoutRef.current) {
      clearTimeout(manualTimeoutRef.current)
    }

    if (isDirectVideoUrl(input)) {
      setFetchingManualVideo(false)
      return
    }

    if (input.length >= 2) {
      setFetchingManualVideo(true)
    } else {
      setFetchingManualVideo(false)
      return
    }

    manualTimeoutRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: input,
        })

        const res = await fetch(`/api/admin/embeds/fetch-video?${params}`)
        if (!res.ok) {

          setFetchingManualVideo(false)
          return
        }

        const video: SearchVideo = await res.json()
        handleSelectVideo(video)
        setManualVideoInput('')
      } catch {

      } finally {
        setFetchingManualVideo(false)
      }
    }, 1000)
  }

  async function handleCreateEmbed() {
    if (!formData.redirectUrl) {
      alert('Please enter a redirect URL')
      return
    }

    try {
      const res = await fetch('/api/admin/embeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: formData.videoId,
          title: formData.title,
          redirectUrl: formData.redirectUrl,
          displayName: formData.displayName || null,
          previewSourceUrl: formData.previewSourceUrl || null,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        alert(`Failed to create embed: ${JSON.stringify(errorData.error || errorData)}`)
        return
      }

      const embedData = await res.json()
      const newEmbedId = embedData.id

      if (formData.previewSourceUrl) {
        alert('Embed created! Downloading preview...')
        await handleDownloadPreview(newEmbedId, formData.previewSourceUrl)
      } else {
        alert('Embed created successfully!')
      }

      resetCreateModal()
      setPage(1)
      fetchEmbeds()
    } catch {
      alert('Error creating embed')
    }
  }

  function resetCreateModal() {
    setFormData({ videoId: '', title: '', redirectUrl: '', displayName: '', previewSourceUrl: '', m3u8Url: '' })
    setSelectedVideo(null)
    setVideoSearch('')
    setSearchResults([])
    setManualVideoInput('')
    setShowCreateModal(false)
  }

  async function handleDeleteEmbed(id: string) {
    if (!confirm('Are you sure you want to delete this embed?')) return

    try {
      const res = await fetch(`/api/admin/embeds/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        alert('Failed to delete embed')
        return
      }
      fetchEmbeds()
    } catch {

      alert('Error deleting embed')
    }
  }

  async function handleDownloadPreview(embedId: string, customSource?: string) {
    try {
      const res = await fetch(`/api/admin/embeds/${embedId}/download-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewSourceUrl: customSource }),
      })

      const data = await res.json()

      if (!res.ok) {
        console.error('Failed to download preview:', data.error)
        return
      }

      console.log('Preview downloaded successfully for embed:', embedId)
    } catch (error) {
      console.error('Error downloading preview:', error)
    }
  }

  function copyEmbedCode(embedId: string) {
    const origin = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://md8av.com')
    const encryptedId = encryptEmbedId(embedId)
    const code = `<script src="${origin}/embed/${encryptedId}"><\/script>`
    navigator.clipboard.writeText(code)
    alert('Embed code copied to clipboard!')
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-[#27272a]">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('manage')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'manage'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            Manage Embeds
          </button>
          <button
            onClick={() => setActiveTab('bulk')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'bulk'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            Bulk Import
          </button>
        </nav>
      </div>

      {/* Bulk Import Tab */}
      {activeTab === 'bulk' && (
        <BulkVideoExtractor onSelectVideo={handleSelectBulkVideo} />
      )}

      {/* Manage Tab */}
      {activeTab === 'manage' && (
      <>
      {/* Create Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Embed
        </button>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search by title or video ID..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
        />
      </div>

      {/* Embeds Table */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#27272a]">
          <h3 className="text-base font-medium text-zinc-100">Embeds</h3>
          <p className="text-sm text-zinc-500 mt-0.5">{total} total embed{total !== 1 ? 's' : ''}</p>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent"></div>
            <p className="mt-2 text-zinc-500">Loading embeds...</p>
          </div>
        ) : embeds.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="mx-auto h-10 w-10 text-zinc-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            <p className="mt-2 text-zinc-300">No embeds found</p>
            <p className="text-sm text-zinc-500">Create your first embed to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#1f1f23] border-b border-[#27272a]">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Title</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Video ID</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">Impressions</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">Clicks</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Created</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a]">
                {embeds.map((embed) => (
                  <tr key={embed.id} className="hover:bg-[#1f1f23] transition-colors">
                    <td className="px-5 py-4 text-sm">
                      <div className="font-medium text-zinc-100">{embed.displayName || embed.title}</div>
                      <div className="text-xs text-zinc-500 truncate mt-1 max-w-xs">{embed.redirectUrl}</div>
                    </td>
                    <td className="px-5 py-4 text-sm font-mono text-zinc-500">{embed.videoId}</td>
                    <td className="px-5 py-4 text-sm font-medium text-zinc-100 text-center">{embed.impressions || 0}</td>
                    <td className="px-5 py-4 text-sm font-medium text-zinc-100 text-center">{embed.clicks || 0}</td>
                    <td className="px-5 py-4 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          embed.enabled
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-zinc-500/10 text-zinc-400'
                        }`}
                      >
                        {embed.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-zinc-500">
                      {new Date(embed.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-4 text-sm">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => copyEmbedCode(embed.id)}
                          title="Copy embed code"
                          className="p-1.5 rounded-lg text-zinc-500 hover:bg-purple-500/10 hover:text-purple-400 transition-colors"
                        >
                          <Copy size={16} />
                        </button>
                        <Link
                          href={`/admin/embeds/${embed.id}/edit`}
                          title="Edit embed settings"
                          className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
                        >
                          <Edit size={16} />
                        </Link>
                        <Link
                          href={`/admin/embeds/${embed.id}`}
                          title="View details and analytics"
                          className="p-1.5 rounded-lg text-zinc-500 hover:bg-purple-500/10 hover:text-purple-400 transition-colors"
                        >
                          <Eye size={16} />
                        </Link>
                        <button
                          onClick={() => handleDeleteEmbed(embed.id)}
                          title="Delete embed"
                          className="p-1.5 rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex justify-between items-center">
          <div className="text-sm text-zinc-400">
            Total: <span className="text-purple-400 font-medium">{total}</span> embed{total !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-4 py-2 rounded-lg border border-[#27272a] bg-[#18181b] text-sm font-medium text-zinc-100 hover:bg-[#1f1f23] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-sm text-zinc-400">
              Page <span className="text-purple-400">{page}</span> of <span className="text-purple-400">{Math.ceil(total / 20)}</span>
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= Math.ceil(total / 20)}
              className="px-4 py-2 rounded-lg border border-[#27272a] bg-[#18181b] text-sm font-medium text-zinc-100 hover:bg-[#1f1f23] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
      </>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-medium text-zinc-100">Create New Embed</h2>
                <p className="text-sm text-zinc-500">Add a new embeddable video widget</p>
              </div>
            </div>

            {/* Video Selection Step */}
            <div className="space-y-4">
                {/* Search Option */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Option 1: Search for a Video</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={videoSearch}
                      onChange={(e) => {
                        setVideoSearch(e.target.value)
                        handleSearchVideosDebounced(e.target.value)
                      }}
                      placeholder="e.g., teen, amateur, etc..."
                      className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
                    />
                    {searching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-zinc-300">Select a Video</label>
                    <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                      {searchResults.map((video) => (
                        <button
                          key={video.id}
                          onClick={() => handleSelectVideo(video)}
                          className="text-left p-3 rounded-lg border border-[#27272a] hover:border-purple-500 hover:bg-[#1f1f23] transition-all group"
                        >
                          <div className="relative w-full aspect-video bg-black rounded mb-2 overflow-hidden">
                            {video.previewVideo ? (
                              <video
                                src={video.previewVideo}
                                className="w-full h-full object-cover"
                                onMouseEnter={(e) => {
                                  const video = e.currentTarget as HTMLVideoElement
                                  video.play().catch(() => {})
                                }}
                                onMouseLeave={(e) => {
                                  const video = e.currentTarget as HTMLVideoElement
                                  video.pause()
                                  video.currentTime = 0
                                }}
                                muted
                              />
                            ) : (
                              <Image
                                src={video.preview}
                                alt={video.title}
                                fill
                                className="object-cover group-hover:scale-110 transition-transform"
                              />
                            )}
                          </div>
                          <div className="text-xs font-medium text-zinc-100 line-clamp-2">{video.title}</div>
                          <div className="text-xs text-zinc-500">{video.videoId}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-[#27272a]"></div>
                  <span className="text-xs text-zinc-500">OR</span>
                  <div className="flex-1 border-t border-[#27272a]"></div>
                </div>

                {/* Option 2: Enter Direct Video/M3U8 URL */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Option 2: Enter Direct Video/M3U8 URL</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={manualVideoInput}
                      onChange={(e) => {
                        setManualVideoInput(e.target.value)
                      }}
                      placeholder="e.g., https://example.com/preview.webm or https://example.com/playlist.m3u8"
                      className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
                    />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1.5">
                    Paste a direct .webm, .mp4, or .m3u8 URL
                  </p>

                  {/* Video Preview for Direct URLs */}
                  {isVideoUrl(manualVideoInput) && (
                    <div className="mt-4 mb-4 bg-[#1f1f23] rounded-lg overflow-hidden">
                      <div className="w-full aspect-video bg-black relative flex items-center justify-center group">
                        {manualVideoInput.includes('.m3u8') ? (
                          <div className="flex flex-col items-center gap-2 text-zinc-500">
                            <Play size={48} className="group-hover:text-purple-400 transition-colors" />
                            <span className="text-sm">M3U8 Playlist Preview</span>
                          </div>
                        ) : (
                          <video
                            src={manualVideoInput}
                            className="w-full h-full object-cover"
                            autoPlay
                            loop
                            muted
                            controls
                            onError={() => {
                              console.error('Failed to load video preview')
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Always show all form fields */}
                  {manualVideoInput && (
                    <div className="space-y-4 pt-4 border-t border-[#27272a]">
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">PornHub Video Link <span className="text-red-400">*</span></label>
                        <div className="relative">
                          <input
                            type="text"
                            value={formData.m3u8Url}
                            onChange={(e) => {
                              const link = e.target.value
                              setFormData({ ...formData, m3u8Url: link, previewSourceUrl: link })

                              if (link.includes('pornhub.com')) {
                                if (manualTimeoutRef.current) {
                                  clearTimeout(manualTimeoutRef.current)
                                }
                                setFetchingManualVideo(true)
                                manualTimeoutRef.current = setTimeout(async () => {
                                  try {
                                    const params = new URLSearchParams({ q: link })
                                    const res = await fetch('/api/admin/embeds/fetch-video-english?' + params.toString())
                                    if (!res.ok) {
                                      setFetchingManualVideo(false)
                                      return
                                    }
                                    const video: SearchVideo = await res.json()
                                    setFormData(prev => ({
                                      ...prev,
                                      title: video.title,
                                      videoId: video.videoId,
                                      previewSourceUrl: video.previewVideo || link
                                    }))
                                    setFetchingManualVideo(false)
                                  } catch {
                                    setFetchingManualVideo(false)
                                  }
                                }, 1000)
                              }
                            }}
                            placeholder="e.g., https://pornhub.com/view_video.php?viewkey=ph123456"
                            className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
                          />
                          {fetchingManualVideo && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <div className="animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-1.5">PornHub link - we&apos;ll auto-fetch the video ID and title</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Title <span className="text-red-400">*</span></label>
                        <input
                          type="text"
                          value={formData.title}
                          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                          placeholder="e.g., Premium Video Title"
                          className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Video ID <span className="text-red-400">*</span></label>
                        <input
                          type="text"
                          value={formData.videoId}
                          onChange={(e) => setFormData({ ...formData, videoId: e.target.value })}
                          placeholder="e.g., ph123456 or custom-id"
                          className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Redirect URL <span className="text-red-400">*</span></label>
                        <input
                          type="url"
                          value={formData.redirectUrl}
                          onChange={(e) => setFormData({ ...formData, redirectUrl: e.target.value })}
                          placeholder="https://yoursite.com or https://affiliate-link.com"
                          className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Custom Display Name <span className="text-zinc-500">(Optional)</span></label>
                        <input
                          type="text"
                          value={formData.displayName}
                          onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                          placeholder="e.g., Premium Video 1, Featured Content"
                          className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-[#27272a]"></div>
                  <span className="text-xs text-zinc-500">OR</span>
                  <div className="flex-1 border-t border-[#27272a]"></div>
                </div>

                {/* Option 3: Enter PornHub Link */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Option 3: Enter PornHub Link</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g., https://www.pornhub.com/view_video.php?viewkey=ph123456"
                      className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
                      onChange={(e) => {
                        const link = e.target.value.trim()
                        if (link.includes('pornhub.com')) {
                          setManualVideoInput(link)
                          setFormData({ ...formData, m3u8Url: link })

                          if (manualTimeoutRef.current) {
                            clearTimeout(manualTimeoutRef.current)
                          }
                          setFetchingManualVideo(true)
                          manualTimeoutRef.current = setTimeout(async () => {
                            try {
                              const params = new URLSearchParams({ q: link })
                              const res = await fetch('/api/admin/embeds/fetch-video-english?' + params.toString())
                              if (!res.ok) {
                                setFetchingManualVideo(false)
                                return
                              }
                              const video: SearchVideo = await res.json()
                              setFormData(prev => ({
                                ...prev,
                                title: video.title,
                                videoId: video.videoId,
                                previewSourceUrl: video.previewVideo || link,
                                m3u8Url: link,
                              }))
                              setFetchingManualVideo(false)
                            } catch {
                              setFetchingManualVideo(false)
                            }
                          }, 1000)
                        }
                      }}
                    />
                    {fetchingManualVideo && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1.5">Paste a PornHub link - we&apos;ll auto-extract the English title, preview, and .webm URL</p>
                </div>
              </div>

            {/* Buttons */}
            <div className="flex gap-3 mt-6 pt-5 border-t border-[#27272a]">
              <button
                onClick={resetCreateModal}
                className="flex-1 px-5 py-2.5 rounded-lg border border-[#27272a] bg-[#18181b] text-sm font-medium text-zinc-100 hover:bg-[#1f1f23] transition-colors"
              >
                Cancel
              </button>
              {manualVideoInput && (
                <button
                  onClick={handleCreateEmbed}
                  disabled={!formData.redirectUrl || !formData.title || !formData.videoId}
                  className="flex-1 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Create Embed
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
