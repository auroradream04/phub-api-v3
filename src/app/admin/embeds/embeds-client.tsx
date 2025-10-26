'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface VideoEmbed {
  id: string
  videoId: string
  title: string
  preview: string
  previewVideo?: string
  redirectUrl: string
  enabled: boolean
  createdAt: string
  _count?: { analytics: number }
}

interface EmbedResponse {
  data: VideoEmbed[]
  total: number
  pages: number
}

export default function EmbedsClient() {
  const [embeds, setEmbeds] = useState<VideoEmbed[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState({
    videoId: '',
    title: '',
    preview: '',
    previewVideo: '',
    redirectUrl: '',
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
      console.error('Error fetching embeds:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateEmbed() {
    try {
      const res = await fetch('/api/admin/embeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        alert('Failed to create embed')
        return
      }

      setFormData({ videoId: '', title: '', preview: '', previewVideo: '', redirectUrl: '' })
      setShowCreateModal(false)
      setPage(1)
      fetchEmbeds()
    } catch (error) {
      console.error('Error creating embed:', error)
      alert('Error creating embed')
    }
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
      console.error('Error deleting embed:', error)
      alert('Error deleting embed')
    }
  }

  function copyEmbedCode(embedId: string) {
    const origin = process.env.NEXT_PUBLIC_APP_URL || typeof window !== 'undefined' ? window.location.origin : ''
    const code = `<script src="${origin}/api/embed/${embedId}/script"><\/script>`
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
                  <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Created</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {embeds.map((embed) => (
                  <tr key={embed.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 text-sm">
                      <div className="font-medium text-foreground">{embed.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{embed.redirectUrl}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-muted-foreground">{embed.videoId}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{embed._count?.analytics || 0}</td>
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
                    <td className="px-6 py-4 text-sm text-right space-x-2">
                      <button
                        onClick={() => copyEmbedCode(embed.id)}
                        className="text-primary hover:text-primary/80 transition-colors"
                      >
                        Copy Code
                      </button>
                      <Link
                        href={`/admin/embeds/${embed.id}`}
                        className="text-primary hover:text-primary/80 transition-colors"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleDeleteEmbed(embed.id)}
                        className="text-destructive hover:text-destructive/80 transition-colors"
                      >
                        Delete
                      </button>
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
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-bold text-foreground mb-4">Create New Embed</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Video ID</label>
                <input
                  type="text"
                  value={formData.videoId}
                  onChange={(e) => setFormData({ ...formData, videoId: e.target.value })}
                  placeholder="e.g., ph123456"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Video title"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Preview Image URL</label>
                <input
                  type="url"
                  value={formData.preview}
                  onChange={(e) => setFormData({ ...formData, preview: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Preview Video URL (Optional)</label>
                <input
                  type="url"
                  value={formData.previewVideo}
                  onChange={(e) => setFormData({ ...formData, previewVideo: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Redirect URL</label>
                <input
                  type="url"
                  value={formData.redirectUrl}
                  onChange={(e) => setFormData({ ...formData, redirectUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 rounded-md border border-input px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateEmbed}
                disabled={!formData.videoId || !formData.title || !formData.preview || !formData.redirectUrl}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
