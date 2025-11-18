'use client'

import { useState, useEffect } from 'react'

interface Setting {
  id: string
  key: string
  value: string
}

const SettingInput = ({
  setting,
  onUpdate,
  isBoolean,
  isNumber
}: {
  setting: Setting
  onUpdate: (value: string) => void
  isBoolean: boolean
  isNumber: boolean
}) => {
  if (isBoolean) {
    return (
      <button
        onClick={() => onUpdate(setting.value === 'true' ? 'false' : 'true')}
        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-200 ${
          setting.value === 'true'
            ? 'bg-primary shadow-md shadow-primary/30'
            : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-200 ${
            setting.value === 'true' ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </button>
    )
  }

  return (
    <input
      type={isNumber ? 'number' : 'text'}
      value={setting.value}
      onChange={(e) => onUpdate(e.target.value)}
      className="w-full px-4 py-3 border border-border/50 bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/50 text-sm"
      min={isNumber ? "0" : undefined}
    />
  )
}

const SettingsSection = ({
  title,
  description,
  settings,
  onUpdate
}: {
  title: string
  description: string
  settings: Setting[]
  onUpdate: (key: string, value: string) => void
}) => {
  if (settings.length === 0) return null

  return (
    <div className="border border-border/50 rounded-lg bg-card/50 p-8">
      {/* Section Header */}
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-8">{description}</p>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {settings.map((setting) => {
          const isBooleanSetting = setting.key === 'AD_ALWAYS_PREROLL' ||
            setting.key === 'AD_PREROLL_ENABLED' ||
            setting.key === 'AD_POSTROLL_ENABLED' ||
            setting.key === 'AD_MIDROLL_ENABLED' ||
            setting.key === 'cors_proxy_enabled' ||
            setting.key === 'auto_translate_titles'

          const isNumberSetting = setting.key === 'AD_MIDROLL_INTERVAL' ||
            setting.key === 'AD_MAX_ADS_PER_VIDEO' ||
            setting.key === 'AD_MIN_VIDEO_FOR_MIDROLL' ||
            setting.key === 'scraper_min_views' ||
            setting.key === 'scraper_min_duration'

          const label = setting.key
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')

          return (
            <div key={setting.id}>
              <label className="block text-sm font-medium text-foreground mb-2">
                {label}
              </label>
              {isBooleanSetting ? (
                <SettingInput
                  setting={setting}
                  onUpdate={(value) => onUpdate(setting.key, value)}
                  isBoolean={true}
                  isNumber={false}
                />
              ) : (
                <SettingInput
                  setting={setting}
                  onUpdate={(value) => onUpdate(setting.key, value)}
                  isBoolean={false}
                  isNumber={isNumberSetting}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
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
    } catch {
      setMessage({ type: 'error', text: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const settingsToSave = settings.filter(s => !s.key.startsWith('scrape_'))
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: settingsToSave })
      })

      if (!response.ok) throw new Error('Failed to save settings')
      setMessage({ type: 'success', text: 'Settings saved successfully!' })
    } catch {
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
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    )
  }

  const adSettings = settings.filter(s => s.key.startsWith('AD_') && !s.key.includes('Checkpoint'))
  const videoSettings = settings.filter(s => (s.key === 'cors_proxy_url' || s.key === 'cors_proxy_enabled') && !s.key.includes('Checkpoint'))
  const scraperSettings = settings.filter(s => (s.key === 'scraper_min_views' || s.key === 'scraper_min_duration' || s.key === 'auto_translate_titles') && !s.key.includes('Checkpoint'))
  const otherSettings = settings.filter(s =>
    !s.key.startsWith('AD_') &&
    !s.key.startsWith('scrape_') &&
    !s.key.includes('Checkpoint') &&
    !s.key.includes('checkpoint') &&
    s.key !== 'scraper_min_views' &&
    s.key !== 'scraper_min_duration' &&
    s.key !== 'auto_translate_titles' &&
    s.key !== 'cors_proxy_url' &&
    s.key !== 'cors_proxy_enabled'
  )

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="mb-8 mt-8">
        <h1 className="text-4xl font-bold text-primary">Site Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Configure global site settings for ads, video streaming, and content processing.</p>
      </div>

      {/* Message Alert */}
      {message && (
        <div className={`mb-6 rounded-lg border p-4 flex items-start gap-3 ${
          message.type === 'success'
            ? 'bg-primary/10 text-primary border-primary/30'
            : 'bg-destructive/10 text-destructive border-destructive/30'
        }`}>
          <div className="flex-shrink-0 mt-0.5">
            {message.type === 'success' ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      {/* Settings Sections */}
      <div className="space-y-6">
        <SettingsSection
          title="Advertisement Settings"
          description="Configure how ads are displayed to users"
          settings={adSettings}
          onUpdate={updateSetting}
        />

        <SettingsSection
          title="Video Streaming Settings"
          description="Configure CORS proxy and video delivery"
          settings={videoSettings}
          onUpdate={updateSetting}
        />

        <SettingsSection
          title="Scraper Settings"
          description="Configure video scraping and content processing"
          settings={scraperSettings}
          onUpdate={updateSetting}
        />

        {otherSettings.length > 0 && (
          <SettingsSection
            title="Other Settings"
            description="Miscellaneous configuration"
            settings={otherSettings}
            onUpdate={updateSetting}
          />
        )}
      </div>

      {/* Save Button */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium flex items-center justify-center gap-2 text-sm"
        >
          {saving ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8v8m0-8a8 8 0 008 8v-8" />
              </svg>
              Saving...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  )
}

