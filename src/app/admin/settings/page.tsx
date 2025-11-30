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
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${
          setting.value === 'true'
            ? 'bg-purple-600'
            : 'bg-[#27272a]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            setting.value === 'true' ? 'translate-x-6' : 'translate-x-1'
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
      className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none text-sm"
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
    <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6">
      {/* Section Header */}
      <h3 className="text-base font-medium text-zinc-100 mb-1">{title}</h3>
      <p className="text-sm text-zinc-500 mb-6">{description}</p>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <label className="block text-sm font-medium text-zinc-300 mb-2">
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
  const [activeTab, setActiveTab] = useState<'ads' | 'video' | 'scraper' | 'other'>('ads')
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
        <div className="text-zinc-500">Loading settings...</div>
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
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Site Settings</h1>
        <p className="text-zinc-500 mt-1">Configure global site settings for ads, video streaming, and content processing.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#27272a]">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('ads')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'ads'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            Advertisements
          </button>
          <button
            onClick={() => setActiveTab('video')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'video'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            Video Streaming
          </button>
          <button
            onClick={() => setActiveTab('scraper')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'scraper'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            Scraper
          </button>
          {otherSettings.length > 0 && (
            <button
              onClick={() => setActiveTab('other')}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'other'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
              }`}
            >
              Other
            </button>
          )}
        </nav>
      </div>

      {/* Message Alert */}
      {message && (
        <div className={`rounded-lg border p-4 flex items-start gap-3 ${
          message.type === 'success'
            ? 'bg-green-500/10 text-green-400 border-green-500/30'
            : 'bg-red-500/10 text-red-400 border-red-500/30'
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
        {activeTab === 'ads' && (
          <SettingsSection
            title="Advertisement Settings"
            description="Configure how ads are displayed to users"
            settings={adSettings}
            onUpdate={updateSetting}
          />
        )}

        {activeTab === 'video' && (
          <SettingsSection
            title="Video Streaming Settings"
            description="Configure CORS proxy and video delivery"
            settings={videoSettings}
            onUpdate={updateSetting}
          />
        )}

        {activeTab === 'scraper' && (
          <SettingsSection
            title="Scraper Settings"
            description="Configure video scraping and content processing"
            settings={scraperSettings}
            onUpdate={updateSetting}
          />
        )}

        {activeTab === 'other' && otherSettings.length > 0 && (
          <SettingsSection
            title="Other Settings"
            description="Miscellaneous configuration"
            settings={otherSettings}
            onUpdate={updateSetting}
          />
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2 text-sm"
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
