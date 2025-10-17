'use client'

import { useState, useEffect } from 'react'

interface Setting {
  id: string
  key: string
  value: string
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings')
      const data = await response.json()
      setSettings(data)
    } catch (error) {
      console.error('Failed to fetch settings:', error)
      setMessage({ type: 'error', text: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      })

      if (!response.ok) throw new Error('Failed to save settings')

      setMessage({ type: 'success', text: 'Settings saved successfully!' })
    } catch (error) {
      console.error('Failed to save settings:', error)
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: string, value: string) => {
    setSettings(settings.map(s => s.key === key ? { ...s, value } : s))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-foreground">Site Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure global site settings for CORS proxy, ads, and video streaming.
          </p>
        </div>
      </div>

      {message && (
        <div className={`mt-4 p-4 rounded-md border ${
          message.type === 'success'
            ? 'bg-primary/10 text-primary border-primary/30'
            : 'bg-destructive/10 text-destructive border-destructive/30'
        }`}>
          {message.text}
        </div>
      )}

      <div className="mt-8 space-y-6">
        {settings.map((setting) => (
          <div key={setting.id} className="bg-card border border-border rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <label htmlFor={setting.key} className="block text-sm font-medium text-foreground">
                {setting.key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </label>
              <div className="mt-2">
                <input
                  type="text"
                  id={setting.key}
                  value={setting.value}
                  onChange={(e) => updateSetting(setting.key, e.target.value)}
                  className="block w-full rounded-md border-border bg-input text-foreground focus:border-primary focus:ring-2 focus:ring-primary sm:text-sm px-3 py-2 transition-colors"
                />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {getSettingDescription(setting.key)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}

function getSettingDescription(key: string): string {
  const descriptions: Record<string, string> = {
    'cors_proxy_url': 'The CORS proxy URL to use for fetching external video segments',
    'cors_proxy_enabled': 'Enable or disable CORS proxy (true/false)',
    'segments_to_skip': 'Number of video segments to skip at the beginning',
    'ads_script_url': 'External URL for fetching ad content'
  }
  return descriptions[key] || 'No description available'
}