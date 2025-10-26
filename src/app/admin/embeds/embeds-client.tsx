'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { encryptEmbedId } from '@/lib/embed-encryption'
import { Copy, Eye, Trash2, Edit } from 'lucide-react'

interface VideoEmbed {
  id: string
  videoId: string
  title: string
  displayName?: string
  preview: string
  previewVideo?: string
  redirectUrl: string
  enabled: boolean
  createdAt: string
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
  const [embeds, setEmbeds] = useState<VideoEmbed[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [videoSearch, setVideoSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchVideo[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState<SearchVideo | null>(null)
  const [manualVideoInput, setManualVideoInput] = useState('')
  const [fetchingManualVideo, setFetchingManualVideo] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const manualTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const [formData, setFormData] = useState({
    videoId: '',
    title: '',
    preview: '',
    previewVideo: '',
    redirectUrl: '',
    displayName: '',
  })


  // Fetch embeds
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
    } catch (error) {

    } finally {
      setLoading(false)
    }
  }

  function handleSearchVideosDebounced(query: string) {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Show loading state immediately
    if (query.length >= 2) {
      setSearching(true)
    } else {
      setSearching(false)
      setSearchResults([])
      return
    }

    // Set timeout for debounce
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
      } catch (error) {

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
      preview: video.preview,
      previewVideo: video.previewVideo || '',
      redirectUrl: '',
      displayName: '',
    })
  }

  function handleFetchManualVideoDebounced(input: string) {
    // Clear previous timeout
    if (manualTimeoutRef.current) {
      clearTimeout(manualTimeoutRef.current)
    }

    // Show loading state immediately
    if (input.length >= 2) {
      setFetchingManualVideo(true)
    } else {
      setFetchingManualVideo(false)
      return
    }

    // Set timeout for debounce
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
      } catch (error) {

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
          ...formData,
          displayName: formData.displayName || null,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()

        alert(`Failed to create embed: ${JSON.stringify(errorData.error || errorData)}`)
        return
      }

      resetCreateModal()
      setPage(1)
      fetchEmbeds()
    } catch (error) {

      alert('Error creating embed')
    }
  }

  function resetCreateModal() {
    setFormData({ videoId: '', title: '', preview: '', previewVideo: '', redirectUrl: '', displayName: '' })
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
    } catch (error) {

      alert('Error deleting embed')
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
      {/* Create Button */}
      <div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
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
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Embeds Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : embeds.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No embeds found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Title</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Video ID</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Impressions</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Clicks</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Created</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {embeds.map((embed) => (
                  <tr key={embed.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 text-sm">
                      <div className="font-medium text-foreground">{embed.displayName || embed.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{embed.redirectUrl}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{embed.videoId}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{embed.impressions || 0}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{embed.clicks || 0}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          embed.enabled
                            ? 'bg-green-100/20 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-red-100/20 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                        }`}
                      >
                        {embed.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(embed.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-3 justify-end">
                        <button
                          onClick={() => copyEmbedCode(embed.id)}
                          title="Copy embed code"
                          className="text-primary hover:text-primary/80 transition-colors"
                        >
                          <Copy size={18} />
                        </button>
                        <Link
                          href={`/admin/embeds/${embed.id}/edit`}
                          title="Edit embed settings"
                          className="text-primary hover:text-primary/80 transition-colors"
                        >
                          <Edit size={18} />
                        </Link>
                        <Link
                          href={`/admin/embeds/${embed.id}`}
                          title="View details and analytics"
                          className="text-primary hover:text-primary/80 transition-colors"
                        >
                          <Eye size={18} />
                        </Link>
                        <button
                          onClick={() => handleDeleteEmbed(embed.id)}
                          title="Delete embed"
                          className="text-destructive hover:text-destructive/80 transition-colors"
                        >
                          <Trash2 size={18} />
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
          <div className="text-sm text-muted-foreground">
            Total: {total} embed{total !== 1 ? 's' : ''}
          </div>
          <div className="space-x-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="rounded-md border border-input px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
            >
              Previous
            </button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {Math.ceil(total / 20)}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= Math.ceil(total / 20)}
              className="rounded-md border border-input px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-foreground mb-4">Create New Embed</h2>

            {!selectedVideo ? (
              // Video Selection Step
              <div className="space-y-4">
                {/* Search Option */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Option 1: Search for a Video</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={videoSearch}
                      onChange={(e) => {
                        setVideoSearch(e.target.value)
                        handleSearchVideosDebounced(e.target.value)
                      }}
                      placeholder="e.g., teen, amateur, etc..."
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {searching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">Select a Video</label>
                    <div className="grid grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                      {searchResults.map((video) => (
                        <button
                          key={video.id}
                          onClick={() => handleSelectVideo(video)}
                          className="text-left p-3 rounded-lg border border-border hover:border-primary hover:bg-muted/50 transition-all group"
                        >
                          <div className="relative w-full aspect-video bg-muted rounded mb-2 overflow-hidden">
                            <Image
                              src={video.preview}
                              alt={video.title}
                              fill
                              className="object-cover group-hover:scale-110 transition-transform"
                            />
                          </div>
                          <div className="text-xs font-medium text-foreground line-clamp-2">{video.title}</div>
                          <div className="text-xs text-muted-foreground">{video.videoId}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-border"></div>
                  <span className="text-xs text-muted-foreground">OR</span>
                  <div className="flex-1 border-t border-border"></div>
                </div>

                {/* Manual Entry Option */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Option 2: Enter Video ID or Link</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={manualVideoInput}
                      onChange={(e) => {
                        setManualVideoInput(e.target.value)
                        handleFetchManualVideoDebounced(e.target.value)
                      }}
                      placeholder="e.g., ph123456 or https://pornhub.com/view_video.php?viewkey=ph123456"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {fetchingManualVideo && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Paste a PornHub link or just the video ID - we&apos;ll auto-fetch all details
                  </p>
                </div>
              </div>
            ) : (
              // Details Step (from search)
              <div className="space-y-4">
                {/* Selected Video Preview */}
                <div className="bg-muted rounded-lg p-4">
                  <div className="flex gap-4">
                    <div className="w-32 h-24 rounded overflow-hidden flex-shrink-0">
                      <Image
                        src={selectedVideo.preview}
                        alt={selectedVideo.title}
                        width={128}
                        height={96}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-1">{selectedVideo.title}</h3>
                      <p className="text-xs text-muted-foreground">ID: {selectedVideo.videoId}</p>
                      <button
                        onClick={() => {
                          setSelectedVideo(null)
                          setSearchResults([])
                          setVideoSearch('')
                        }}
                        className="text-xs text-primary hover:text-primary/80 mt-2"
                      >
                        Change Video
                      </button>
                    </div>
                  </div>
                </div>

                {/* Display Name */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Custom Display Name (Optional)</label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="e.g., Premium Video 1, Featured Content"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Optional name to identify this embed in your dashboard (shows title if empty)
                  </p>
                </div>

                {/* Redirect URL */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Redirect URL *</label>
                  <input
                    type="url"
                    value={formData.redirectUrl}
                    onChange={(e) => setFormData({ ...formData, redirectUrl: e.target.value })}
                    placeholder="https://yoursite.com or https://affiliate-link.com"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Where users will be taken when they click the embed
                  </p>
                </div>

                {/* Info */}
                <div className="bg-muted/50 rounded p-3 text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Preview Details Auto-filled:</p>
                  <ul className="space-y-1">
                    <li>✓ Video ID: {formData.videoId}</li>
                    <li>✓ Title: {formData.title}</li>
                    <li>✓ Preview Image: Fetched</li>
                    {formData.previewVideo && <li>✓ Preview Video: Fetched</li>}
                  </ul>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={resetCreateModal}
                className="flex-1 rounded-md border border-input px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              {selectedVideo && (
                <button
                  onClick={handleCreateEmbed}
                  disabled={!formData.redirectUrl}
                  className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
