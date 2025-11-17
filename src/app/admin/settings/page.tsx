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
      // Filter out checkpoint scrape entries before saving
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
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
          Site Settings
        </h1>
        <p className="mt-2 text-muted-foreground">
          Configure global site settings for CORS proxy, ads, and video streaming.
        </p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${
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
          <div>
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-8">
        {/* Advertisement Settings */}
        {settings.filter(s => s.key.startsWith('AD_') && !s.key.includes('Checkpoint')).length > 0 && (
          <div className="bg-card border border-border/50 rounded-2xl shadow-md overflow-hidden">
            <div className="border-b border-border/50 px-8 py-6">
              <h2 className="text-xl font-bold text-foreground">Advertisement Settings</h2>
              <p className="text-sm text-muted-foreground mt-1">Configure how ads are displayed to users</p>
            </div>
            <div className="divide-y divide-border/50">
              {settings
                .filter(setting => setting.key.startsWith('AD_'))
                .map((setting) => {
                  const isBooleanSetting = setting.key === 'AD_ALWAYS_PREROLL' || setting.key === 'AD_PREROLL_ENABLED' ||
                    setting.key === 'AD_POSTROLL_ENABLED' || setting.key === 'AD_MIDROLL_ENABLED'
                  const isNumberSetting = setting.key === 'AD_MIDROLL_INTERVAL' || setting.key === 'AD_MAX_ADS_PER_VIDEO' ||
                    setting.key === 'AD_MIN_VIDEO_FOR_MIDROLL'

                  return (
                    <div key={setting.id} className="px-8 py-6 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="flex-1">
                        <label htmlFor={setting.key} className="block text-sm font-semibold text-foreground">
                          {setting.key
                            .split('_')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ')}
                        </label>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {getSettingDescription(setting.key)}
                        </p>
                      </div>

                      <div className="ml-8 flex-shrink-0">
                        {isBooleanSetting ? (
                          <button
                            onClick={() => updateSetting(setting.key, setting.value === 'true' ? 'false' : 'true')}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200 ${
                              setting.value === 'true'
                                ? 'bg-primary shadow-md shadow-primary/30'
                                : 'bg-muted'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
                                setting.value === 'true' ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        ) : (
                          <input
                            type={isNumberSetting ? 'number' : 'text'}
                            id={setting.key}
                            value={setting.value}
                            onChange={(e) => updateSetting(setting.key, e.target.value)}
                            className="block w-48 px-4 py-2.5 border border-border/50 bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/50 text-sm"
                            min={isNumberSetting ? "0" : undefined}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Video Streaming Settings */}
        {settings.filter(s => (s.key === 'cors_proxy_url' || s.key === 'cors_proxy_enabled') && !s.key.includes('Checkpoint')).length > 0 && (
          <div className="bg-card border border-border/50 rounded-2xl shadow-md overflow-hidden">
            <div className="border-b border-border/50 px-8 py-6">
              <h2 className="text-xl font-bold text-foreground">Video Streaming Settings</h2>
              <p className="text-sm text-muted-foreground mt-1">Configure CORS proxy and video delivery</p>
            </div>
            <div className="divide-y divide-border/50">
              {settings
                .filter(setting => setting.key === 'cors_proxy_url' || setting.key === 'cors_proxy_enabled')
                .map((setting) => {
                  const isBooleanSetting = setting.key === 'cors_proxy_enabled'

                  return (
                    <div key={setting.id} className="px-8 py-6 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="flex-1">
                        <label htmlFor={setting.key} className="block text-sm font-semibold text-foreground">
                          {setting.key
                            .split('_')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ')}
                        </label>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {getSettingDescription(setting.key)}
                        </p>
                      </div>

                      <div className="ml-8 flex-shrink-0">
                        {isBooleanSetting ? (
                          <button
                            onClick={() => updateSetting(setting.key, setting.value === 'true' ? 'false' : 'true')}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200 ${
                              setting.value === 'true'
                                ? 'bg-primary shadow-md shadow-primary/30'
                                : 'bg-muted'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
                                setting.value === 'true' ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        ) : (
                          <input
                            type="text"
                            id={setting.key}
                            value={setting.value}
                            onChange={(e) => updateSetting(setting.key, e.target.value)}
                            className="block w-48 px-4 py-2.5 border border-border/50 bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/50 text-sm"
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Scraper Settings */}
        {settings.filter(s => (s.key === 'scraper_min_views' || s.key === 'scraper_min_duration' || s.key === 'auto_translate_titles') && !s.key.includes('Checkpoint')).length > 0 && (
          <div className="bg-card border border-border/50 rounded-2xl shadow-md overflow-hidden">
            <div className="border-b border-border/50 px-8 py-6">
              <h2 className="text-xl font-bold text-foreground">Scraper Settings</h2>
              <p className="text-sm text-muted-foreground mt-1">Configure video scraping and content processing</p>
            </div>
            <div className="divide-y divide-border/50">
              {settings
                .filter(setting => setting.key === 'scraper_min_views' || setting.key === 'scraper_min_duration' || setting.key === 'auto_translate_titles')
                .map((setting) => {
                  const isBooleanSetting = setting.key === 'auto_translate_titles'
                  const isNumberSetting = setting.key.includes('min_views') || setting.key.includes('min_duration')

                  return (
                    <div key={setting.id} className="px-8 py-6 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="flex-1">
                        <label htmlFor={setting.key} className="block text-sm font-semibold text-foreground">
                          {setting.key
                            .split('_')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ')}
                        </label>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {getSettingDescription(setting.key)}
                        </p>
                      </div>

                      <div className="ml-8 flex-shrink-0">
                        {isBooleanSetting ? (
                          <button
                            onClick={() => updateSetting(setting.key, setting.value === 'true' ? 'false' : 'true')}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-200 ${
                              setting.value === 'true'
                                ? 'bg-primary shadow-md shadow-primary/30'
                                : 'bg-muted'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
                                setting.value === 'true' ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        ) : (
                          <input
                            type={isNumberSetting ? 'number' : 'text'}
                            id={setting.key}
                            value={setting.value}
                            onChange={(e) => updateSetting(setting.key, e.target.value)}
                            className="block w-48 px-4 py-2.5 border border-border/50 bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/50 text-sm"
                            min={isNumberSetting ? "0" : undefined}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Other Settings */}
        {settings.filter(s =>
          !s.key.startsWith('AD_') &&
          !s.key.startsWith('scrape_') &&
          !s.key.includes('Checkpoint') &&
          !s.key.includes('checkpoint') &&
          s.key !== 'scraper_min_views' &&
          s.key !== 'scraper_min_duration' &&
          s.key !== 'auto_translate_titles' &&
          s.key !== 'cors_proxy_url' &&
          s.key !== 'cors_proxy_enabled'
        ).length > 0 && (
          <div className="bg-card border border-border/50 rounded-2xl shadow-md overflow-hidden">
            <div className="border-b border-border/50 px-8 py-6">
              <h2 className="text-xl font-bold text-foreground">Other Settings</h2>
              <p className="text-sm text-muted-foreground mt-1">Miscellaneous configuration</p>
            </div>
            <div className="divide-y divide-border/50">
              {settings
                .filter(setting =>
                  !setting.key.startsWith('AD_') &&
                  !setting.key.startsWith('scrape_') &&
                  !setting.key.includes('Checkpoint') &&
                  !setting.key.includes('checkpoint') &&
                  setting.key !== 'scraper_min_views' &&
                  setting.key !== 'scraper_min_duration' &&
                  setting.key !== 'auto_translate_titles' &&
                  setting.key !== 'cors_proxy_url' &&
                  setting.key !== 'cors_proxy_enabled'
                )
                .map((setting) => {
                  return (
                    <div key={setting.id} className="px-8 py-6 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="flex-1">
                        <label htmlFor={setting.key} className="block text-sm font-semibold text-foreground">
                          {setting.key
                            .split('_')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ')}
                        </label>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {getSettingDescription(setting.key)}
                        </p>
                      </div>

                      <div className="ml-8 flex-shrink-0">
                        <input
                          type="text"
                          id={setting.key}
                          value={setting.value}
                          onChange={(e) => updateSetting(setting.key, e.target.value)}
                          className="block w-48 px-4 py-2.5 border border-border/50 bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/50 text-sm"
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-lg hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center gap-2"
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

function getSettingDescription(key: string): string {
  const descriptions: Record<string, string> = {
    'cors_proxy_url': 'The CORS proxy URL to use for fetching external video segments',
    'cors_proxy_enabled': 'Enable or disable CORS proxy (true/false)',
    'segments_to_skip': 'Number of video segments to skip at the beginning',
    'ads_script_url': 'External URL for fetching ad content',
    'scraper_min_views': 'Minimum view count required to scrape a video (e.g., 10000). Videos below this will be skipped.',
    'scraper_min_duration': 'Minimum duration in seconds required to scrape a video (e.g., 60). Videos shorter than this will be skipped.',
    'auto_translate_titles': 'Automatically translate non-Chinese video titles to Chinese using Google Translate',
    // Ad placement settings
    'AD_ALWAYS_PREROLL': 'Always show a pre-roll ad at the beginning of every video (mandatory)',
    'AD_PREROLL_ENABLED': 'Enable or disable pre-roll ads that play before video starts',
    'AD_POSTROLL_ENABLED': 'Enable or disable post-roll ads that play at the end of video',
    'AD_MIDROLL_ENABLED': 'Enable or disable mid-roll ads throughout the video',
    'AD_MIDROLL_INTERVAL': 'How often to show mid-roll ads in seconds (e.g., 600 = every 10 minutes)',
    'AD_MAX_ADS_PER_VIDEO': 'Maximum number of total ads to show per video (e.g., 20)',
    'AD_MIN_VIDEO_FOR_MIDROLL': 'Minimum video length in seconds before showing mid-roll ads (e.g., 600 = 10 minutes)'
  }
  return descriptions[key] || 'No description available'
}
