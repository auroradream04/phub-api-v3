'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { encryptEmbedId } from '@/lib/embed-encryption'

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
  impressions?: number
  clicks?: number
}

interface EmbedModalProps {
  embedId: string | null
  mode: 'view' | 'edit'
  isOpen: boolean
  onClose: () => void
  onSave?: () => void
}

interface Analytics {
  embedId: string
  impressions: number
  clicks: number
  ctr: number
  domainBreakdown: Record<string, number>
  period: { from: string; to: string }
}

export default function EmbedModal({ embedId, mode, isOpen, onClose, onSave }: EmbedModalProps) {
  const [embed, setEmbed] = useState<VideoEmbed | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [days, setDays] = useState(7)

  useEffect(() => {
    if (isOpen && embedId) {
      fetchEmbed()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, embedId, days])

  async function fetchEmbed() {
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/embeds/${embedId}`)
      if (!res.ok) throw new Error('Failed to fetch embed')

      const data: VideoEmbed = await res.json()
      setEmbed(data)
      setDisplayName(data.displayName || '')
      setRedirectUrl(data.redirectUrl)
      setEnabled(data.enabled)

      // Fetch analytics if in view mode
      if (mode === 'view') {
        const analyticsRes = await fetch(
          `/api/admin/embeds/${embedId}/analytics?days=${days}`
        )
        if (analyticsRes.ok) {
          const analyticsData: Analytics = await analyticsRes.json()
          setAnalytics(analyticsData)
        }
      }
    } catch (error) {
      console.error('Error fetching embed:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!redirectUrl) {
      alert('Redirect URL is required')
      return
    }

    try {
      setSaving(true)
      const res = await fetch(`/api/admin/embeds/${embedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName || null,
          redirectUrl,
          enabled,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error?.message || 'Failed to save embed')
      }

      alert('Embed updated successfully!')
      onClose()
      onSave?.()
    } catch (error) {
      console.error('Error saving embed:', error)
      const message = error instanceof Error ? error.message : 'Failed to save embed'
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-foreground">
            {mode === 'view' ? 'Embed Details & Analytics' : 'Edit Embed'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-center text-muted-foreground">Loading...</div>
          ) : !embed ? (
            <div className="text-center text-muted-foreground">Embed not found</div>
          ) : mode === 'view' ? (
            // View Mode
            <div className="space-y-6">
              {/* Preview */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Preview</h3>
                <img
                  src={embed.preview}
                  alt={embed.title}
                  className="w-full h-auto rounded-lg"
                />
              </div>

              {/* Details */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Title</label>
                  <div className="text-foreground mt-1">{embed.title}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Display Name
                  </label>
                  <div className="text-foreground mt-1">{embed.displayName || '(using title)'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Video ID</label>
                  <div className="text-foreground font-mono mt-1">{embed.videoId}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Redirect URL
                  </label>
                  <a
                    href={embed.redirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 truncate block mt-1"
                  >
                    {embed.redirectUrl}
                  </a>
                </div>
              </div>

              {/* Analytics */}
              <div className="border-t border-border pt-6">
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1 bg-muted/50 rounded p-4">
                      <div className="text-2xl font-bold text-foreground">
                        {analytics?.impressions || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Impressions</div>
                    </div>
                    <div className="flex-1 bg-muted/50 rounded p-4">
                      <div className="text-2xl font-bold text-foreground">
                        {analytics?.clicks || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">Clicks</div>
                    </div>
                    <div className="flex-1 bg-muted/50 rounded p-4">
                      <div className="text-2xl font-bold text-foreground">
                        {analytics?.ctr.toFixed(2) || 0}%
                      </div>
                      <div className="text-xs text-muted-foreground">CTR</div>
                    </div>
                  </div>

                  {/* Period Selector */}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground block mb-2">
                      Period
                    </label>
                    <select
                      value={days}
                      onChange={(e) => setDays(parseInt(e.target.value))}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value={1}>Last 24 hours</option>
                      <option value={7}>Last 7 days</option>
                      <option value={30}>Last 30 days</option>
                      <option value={90}>Last 90 days</option>
                    </select>
                  </div>

                  {/* Top Domains */}
                  {analytics && Object.keys(analytics.domainBreakdown).length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground block mb-2">
                        Top Domains
                      </label>
                      <div className="space-y-2">
                        {Object.entries(analytics.domainBreakdown)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 5)
                          .map(([domain, count]) => (
                            <div
                              key={domain}
                              className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded"
                            >
                              <span className="text-foreground truncate">{domain || 'Direct'}</span>
                              <span className="text-muted-foreground font-medium">{count}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // Edit Mode
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Custom Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Leave empty to use original title"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Optional custom name to identify this embed
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Video Title (Read-only)
                </label>
                <div className="px-3 py-2 text-sm text-muted-foreground bg-muted rounded-md">
                  {embed.title}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Redirect URL *
                </label>
                <input
                  type="url"
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                  placeholder="https://yoursite.com"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Where users will be taken when they click the embed
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Status</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-input accent-primary"
                  />
                  <span className="text-sm text-foreground">
                    {enabled ? 'Active' : 'Disabled'}
                  </span>
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  Disable to prevent this embed from loading
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'edit' && (
          <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4 flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="rounded-md border border-input px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
