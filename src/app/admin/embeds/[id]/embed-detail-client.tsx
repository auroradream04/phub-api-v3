'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { encryptEmbedId } from '@/lib/embed-encryption'

interface VideoEmbed {
  id: string
  videoId: string
  title: string
  preview: string
  previewVideo?: string
  redirectUrl: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

interface Analytics {
  embedId: string
  impressions: number
  clicks: number
  ctr: number
  domainBreakdown: Record<string, number>
  dailyStats: Record<string, { impressions: number; clicks: number }>
  period: { from: string; to: string }
}

export default function EmbedDetailClient({ embedId }: { embedId: string }) {
  const [embed, setEmbed] = useState<VideoEmbed | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [editingUrl, setEditingUrl] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  async function fetchData() {
    try {
      setLoading(true)

      const [embedRes, analyticsRes] = await Promise.all([
        fetch(`/api/admin/embeds/${embedId}`),
        fetch(`/api/admin/embeds/${embedId}/analytics?days=${days}`),
      ])

      if (embedRes.ok) {
        const embedData = await embedRes.json()
        setEmbed(embedData)
        setEditingUrl(embedData.redirectUrl)
      }

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json()
        setAnalytics(analyticsData)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateUrl() {
    if (!embed) return

    try {
      const res = await fetch(`/api/admin/embeds/${embedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectUrl: editingUrl }),
      })

      if (res.ok) {
        setEmbed({ ...embed, redirectUrl: editingUrl })
        setIsEditing(false)
        alert('Updated successfully!')
      }
    } catch (error) {
      console.error('Error updating:', error)
      alert('Error updating embed')
    }
  }

  if (loading || !embed) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link href="/admin/embeds" className="text-primary hover:text-primary/80">
        ← Back to Embeds
      </Link>

      {/* Embed Preview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Preview */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-bold text-foreground mb-4">Preview</h2>
            <div className="aspect-video bg-muted rounded-lg overflow-hidden">
              <Image
                src={embed.preview}
                alt={embed.title}
                width={267}
                height={150}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Details */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-bold text-foreground mb-4">Details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground">Title</label>
                <div className="text-lg text-foreground font-semibold mt-1">{embed.title}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground">Video ID</label>
                <div className="text-lg text-foreground font-mono mt-1">{embed.videoId}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Redirect URL</label>
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="url"
                      value={editingUrl}
                      onChange={(e) => setEditingUrl(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleUpdateUrl}
                        className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setIsEditing(false)
                          setEditingUrl(embed.redirectUrl)
                        }}
                        className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <a
                      href={embed.redirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 truncate"
                    >
                      {embed.redirectUrl}
                    </a>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-primary hover:text-primary/80 text-sm"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Embed Code */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-bold text-foreground mb-4">Embed Code</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Copy and paste this code on any website to embed this widget:
            </p>
            {(() => {
              const encryptedId = encryptEmbedId(embed.id)
              const code = `<script src="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/embed/${encryptedId}/script"><\/script>`
              return (
                <>
                  <div className="bg-muted rounded-lg p-3 font-mono text-sm text-foreground overflow-x-auto">
                    <code>{code}</code>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(code)
                      alert('Copied to clipboard!')
                    }}
                    className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Copy Code
                  </button>
                </>
              )
            })()}
          </div>
        </div>

        {/* Analytics Sidebar */}
        <div className="space-y-4">
          {/* Stats Cards */}
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Last {days} Days</h3>
            <div className="space-y-3">
              <div className="bg-muted/50 rounded p-3">
                <div className="text-2xl font-bold text-foreground">{analytics?.impressions || 0}</div>
                <div className="text-xs text-muted-foreground">Impressions</div>
              </div>
              <div className="bg-muted/50 rounded p-3">
                <div className="text-2xl font-bold text-foreground">{analytics?.clicks || 0}</div>
                <div className="text-xs text-muted-foreground">Clicks</div>
              </div>
              <div className="bg-muted/50 rounded p-3">
                <div className="text-2xl font-bold text-foreground">{analytics?.ctr.toFixed(2) || 0}%</div>
                <div className="text-xs text-muted-foreground">Click Rate</div>
              </div>
            </div>
          </div>

          {/* Time Period Selector */}
          <div className="bg-card border border-border rounded-lg p-4">
            <label className="block text-sm font-medium text-muted-foreground mb-2">Period</label>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value={1}>Last 24 hours</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>

          {/* Domain Breakdown */}
          {analytics && Object.keys(analytics.domainBreakdown).length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Top Domains</h3>
              <div className="space-y-2">
                {Object.entries(analytics.domainBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([domain, count]) => (
                    <div key={domain} className="flex justify-between items-center text-sm">
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
  )
}
