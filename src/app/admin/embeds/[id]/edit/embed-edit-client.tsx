'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface VideoEmbed {
  id: string
  videoId: string
  title: string
  displayName?: string
  redirectUrl: string
  enabled: boolean
}

export default function EmbedEditClient({ embedId }: { embedId: string }) {
  const router = useRouter()
  const [embed, setEmbed] = useState<VideoEmbed | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    fetchEmbed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    } catch (error) {

      alert('Failed to load embed')
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
      router.push(`/admin/embeds/${embedId}`)
    } catch (error) {

      const message = error instanceof Error ? error.message : 'Failed to save embed'
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading...</div>
  if (!embed) return <div className="text-muted-foreground">Embed not found</div>

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="space-y-4">
          {/* Display Name */}
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
              Optional custom name to identify this embed (for your reference only)
            </p>
          </div>

          {/* Video Info (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Video Title
            </label>
            <div className="px-3 py-2 text-sm text-muted-foreground bg-muted rounded-md">
              {embed.title}
            </div>
          </div>

          {/* Redirect URL */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Redirect URL *
            </label>
            <input
              type="url"
              value={redirectUrl}
              onChange={(e) => setRedirectUrl(e.target.value)}
              placeholder="https://yoursite.com or https://affiliate-link.com"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Where users will be taken when they click the embed
            </p>
          </div>

          {/* Enabled Toggle */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Status
            </label>
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

        {/* Buttons */}
        <div className="flex gap-2 mt-6">
          <Link
            href={`/admin/embeds/${embedId}`}
            className="flex-1 rounded-md border border-input px-4 py-2 text-sm font-semibold hover:bg-muted transition-colors text-center"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
