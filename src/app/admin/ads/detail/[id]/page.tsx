'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Hls from 'hls.js'

interface Ad {
  id: string
  title: string
  description: string | null
  status: string
  weight: number
  forceDisplay: boolean
  duration: number
}

interface Stats {
  totalImpressions: number
  impressionsInPeriod: number
  growth: string
}

interface Source {
  source: string
  count: number
}

interface Video {
  videoId: string
  count: number
}

interface Browser {
  browser: string
  count: number
  percentage: string
}

interface Device {
  device: string
  count: number
  percentage: string
}

interface OS {
  os: string
  count: number
  percentage: string
}

interface Country {
  country: string
  count: number
  percentage: string
}

interface ChartDataPoint {
  date: string
  count: number
}

interface AnalyticsData {
  ad: Ad
  stats: Stats
  topSources: Source[]
  topVideos: Video[]
  browsers: Browser[]
  devices: Device[]
  operatingSystems: OS[]
  countries: Country[]
  chartData: ChartDataPoint[]
  period: {
    days: number
    startDate: string
    endDate: string
  }
}

const TIME_RANGES = [
  { label: '30m', value: 0.021 },
  { label: '1h', value: 0.042 },
  { label: '24h', value: 1 },
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '1y', value: 365 },
] as const

export default function AdDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const adId = params.id as string

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'analytics')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState(7)
  const [saving, setSaving] = useState(false)
  const [isPending, startTransition] = useTransition()
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'active',
    weight: 1,
    forceDisplay: false
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!data) setLoading(true)
        const response = await fetch(`/api/admin/ads/detail/${adId}?days=${timeRange}`)

        if (!response.ok) {
          throw new Error('Failed to fetch data')
        }

        const result = await response.json()
        setData(result)

        setFormData({
          title: result.ad.title,
          description: result.ad.description || '',
          status: result.ad.status,
          weight: result.ad.weight,
          forceDisplay: result.ad.forceDisplay
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [adId, timeRange])

  useEffect(() => {
    if (!data?.ad.id || !videoRef.current) return

    const video = videoRef.current
    const playlistUrl = `/api/admin/ads/${data.ad.id}/playlist`

    if (Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(playlistUrl)
      hls.attachMedia(video)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playlistUrl
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
    }
  }, [data?.ad.id])

  const handleTimeRangeChange = (value: number) => {
    startTransition(() => {
      setTimeRange(value)
    })
  }

  const handleSaveSettings = async () => {
    try {
      setSaving(true)
      const response = await fetch(`/api/admin/ads/${adId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        throw new Error('Failed to update ad')
      }

      const result = await response.json()
      if (data) {
        setData({ ...data, ad: { ...data.ad, ...result } })
      }

      alert('Settings saved successfully!')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-pink-500 border-t-transparent"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8 bg-background min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
            <p className="text-red-400">{error || 'Failed to load data'}</p>
          </div>
        </div>
      </div>
    )
  }

  const maxCount = Math.max(...data.chartData.map(d => d.count), 1)

  const getScaledMax = (max: number) => {
    if (max === 0) return 10
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
    const normalized = max / magnitude
    let rounded: number
    if (normalized <= 1) rounded = 1
    else if (normalized <= 2) rounded = 2
    else if (normalized <= 5) rounded = 5
    else rounded = 10
    return rounded * magnitude
  }

  const scaledMax = getScaledMax(maxCount)

  const formatChartLabel = (dateStr: string) => {
    const date = new Date(dateStr)
    if (timeRange <= 1) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const growthNum = parseFloat(data.stats.growth)
  const isPositiveGrowth = growthNum >= 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/admin/ads')}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors mb-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Ads
              </button>
              <h1 className="text-xl font-semibold text-foreground">{data.ad.title}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  data.ad.status === 'active'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-zinc-500/10 text-zinc-400'
                }`}>
                  {data.ad.status}
                </span>
                <span className="text-sm text-muted-foreground">
                  {data.ad.duration}s duration
                </span>
              </div>
            </div>

            {activeTab === 'analytics' && (
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                {TIME_RANGES.map(({ label, value }) => (
                  <button
                    key={label}
                    onClick={() => handleTimeRangeChange(value)}
                    disabled={isPending}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      timeRange === value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    } ${isPending ? 'opacity-70' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-6 mt-4 border-t border-border pt-4">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                activeTab === 'analytics'
                  ? 'border-pink-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-pink-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      <div className={`max-w-7xl mx-auto transition-opacity duration-200 ${isPending ? 'opacity-60' : ''}`}>
        {activeTab === 'analytics' ? (
          <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-card rounded-lg border border-border p-4">
                <div className="text-sm text-muted-foreground mb-1">Period Impressions</div>
                <div className="text-2xl font-semibold text-foreground">
                  {data.stats.impressionsInPeriod.toLocaleString()}
                </div>
                <div className={`text-sm mt-1 ${isPositiveGrowth ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositiveGrowth ? '↑' : '↓'} {Math.abs(growthNum).toFixed(1)}% vs previous
                </div>
              </div>

              <div className="bg-card rounded-lg border border-border p-4">
                <div className="text-sm text-muted-foreground mb-1">Total Impressions</div>
                <div className="text-2xl font-semibold text-foreground">
                  {data.stats.totalImpressions.toLocaleString()}
                </div>
                <div className="text-sm text-muted-foreground mt-1">All time</div>
              </div>

              <div className="bg-card rounded-lg border border-border p-4">
                <div className="text-sm text-muted-foreground mb-1">Unique Videos</div>
                <div className="text-2xl font-semibold text-foreground">
                  {data.topVideos.length}
                </div>
                <div className="text-sm text-muted-foreground mt-1">In period</div>
              </div>

              <div className="bg-card rounded-lg border border-border p-4">
                <div className="text-sm text-muted-foreground mb-1">Top Source</div>
                <div className="text-lg font-semibold text-foreground truncate">
                  {data.topSources[0]?.source || 'N/A'}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {data.topSources[0]?.count.toLocaleString() || 0} views
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-card rounded-lg border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">
                  {timeRange <= 1 ? 'Hourly' : 'Daily'} Views
                </h2>
                <span className="text-sm text-muted-foreground">
                  {new Date(data.period.startDate).toLocaleDateString()} - {new Date(data.period.endDate).toLocaleDateString()}
                </span>
              </div>

              {data.chartData.length > 0 ? (
                <div className="h-64">
                  <div className="flex h-full">
                    {/* Y-axis */}
                    <div className="flex flex-col justify-between text-xs text-muted-foreground pr-3 py-1">
                      <span>{scaledMax.toLocaleString()}</span>
                      <span>{Math.round(scaledMax * 0.5).toLocaleString()}</span>
                      <span>0</span>
                    </div>

                    {/* Chart area */}
                    <div className="flex-1 relative">
                      {/* Grid lines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                        <div className="border-t border-border/50"></div>
                        <div className="border-t border-border/50"></div>
                        <div className="border-t border-border/50"></div>
                      </div>

                      {/* Bars */}
                      <div className="relative h-full flex items-end gap-px">
                        {data.chartData.map((point, i) => {
                          const height = scaledMax > 0 ? (point.count / scaledMax) * 100 : 0
                          const showLabel = data.chartData.length <= 14 || i % Math.ceil(data.chartData.length / 7) === 0

                          return (
                            <div key={point.date} className="flex-1 flex flex-col h-full group">
                              <div className="flex-1 flex items-end justify-center relative">
                                <div
                                  className="w-full max-w-[32px] bg-pink-500/80 hover:bg-pink-500 transition-colors rounded-t cursor-pointer mx-auto"
                                  style={{ height: `${Math.max(height, point.count > 0 ? 2 : 0)}%` }}
                                />
                                {/* Tooltip */}
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                  <div className="bg-popover text-popover-foreground text-xs px-2 py-1.5 rounded shadow-lg border border-border whitespace-nowrap">
                                    <div className="font-medium">{point.count.toLocaleString()}</div>
                                    <div className="text-muted-foreground">{formatChartLabel(point.date)}</div>
                                  </div>
                                </div>
                              </div>
                              {showLabel && (
                                <div className="text-xs text-muted-foreground text-center mt-2 truncate px-1">
                                  {formatChartLabel(point.date)}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  No data for this period
                </div>
              )}
            </div>

            {/* Two Column Layout */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Top Sources */}
              <div className="bg-card rounded-lg border border-border p-5">
                <h2 className="text-base font-semibold text-foreground mb-4">Top Sources</h2>
                {data.topSources.length > 0 ? (
                  <div className="space-y-3">
                    {data.topSources.map((source, i) => {
                      const maxSourceCount = data.topSources[0]?.count || 1
                      const width = (source.count / maxSourceCount) * 100

                      return (
                        <div key={i} className="group">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-foreground truncate pr-2">{source.source}</span>
                            <span className="text-muted-foreground font-medium">{source.count.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-pink-500/60 rounded-full transition-all"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </div>

              {/* Top Videos */}
              <div className="bg-card rounded-lg border border-border p-5">
                <h2 className="text-base font-semibold text-foreground mb-4">Top Videos</h2>
                {data.topVideos.length > 0 ? (
                  <div className="space-y-3">
                    {data.topVideos.slice(0, 10).map((video, i) => {
                      const maxVideoCount = data.topVideos[0]?.count || 1
                      const width = (video.count / maxVideoCount) * 100

                      return (
                        <div key={i} className="group">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <a
                              href={`/watch/${video.videoId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-pink-400 hover:text-pink-300 truncate pr-2 transition-colors"
                            >
                              {video.videoId}
                            </a>
                            <span className="text-muted-foreground font-medium">{video.count.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-pink-500/60 rounded-full transition-all"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </div>
            </div>

            {/* Two Column Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Devices */}
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Devices</h3>
                {data.devices.length > 0 ? (
                  <div className="space-y-2">
                    {data.devices.map((device, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{device.device}</span>
                        <span className="text-foreground font-medium">{device.percentage}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </div>

              {/* Browsers */}
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Browsers</h3>
                {data.browsers.length > 0 ? (
                  <div className="space-y-2">
                    {data.browsers.map((browser, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{browser.browser}</span>
                        <span className="text-foreground font-medium">{browser.percentage}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </div>

              {/* Operating Systems */}
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">OS</h3>
                {data.operatingSystems.length > 0 ? (
                  <div className="space-y-2">
                    {data.operatingSystems.map((os, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{os.os}</span>
                        <span className="text-foreground font-medium">{os.percentage}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </div>

              {/* Countries */}
              <div className="bg-card rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Countries</h3>
                {data.countries.length > 0 ? (
                  <div className="space-y-2">
                    {data.countries.slice(0, 5).map((country, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{country.country}</span>
                        <span className="text-foreground font-medium">{country.percentage}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data</p>
                )}
              </div>
            </div>

            {/* Ad Preview */}
            <div className="bg-card rounded-lg border border-border p-5">
              <h2 className="text-base font-semibold text-foreground mb-4">Ad Preview</h2>
              <div className="max-w-2xl mx-auto">
                <video
                  ref={videoRef}
                  controls
                  className="w-full rounded-lg bg-black"
                >
                  Your browser does not support HLS playback.
                </video>
              </div>
            </div>
          </div>
        ) : (
          /* Settings Tab */
          <div className="max-w-2xl">
            <div className="bg-card rounded-lg border border-border p-6">
              <h2 className="text-base font-semibold text-foreground mb-6">Ad Settings</h2>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border text-foreground rounded-lg focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 bg-background border border-border text-foreground rounded-lg focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-colors resize-none"
                    placeholder="Optional description"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border text-foreground rounded-lg focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-colors"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Weight
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-background border border-border text-foreground rounded-lg focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-colors"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Higher = more likely to show</p>
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="forceDisplay"
                    checked={formData.forceDisplay}
                    onChange={(e) => setFormData({ ...formData, forceDisplay: e.target.checked })}
                    className="h-4 w-4 text-pink-500 bg-background border-border rounded focus:ring-pink-500/20"
                  />
                  <label htmlFor="forceDisplay" className="ml-2 text-sm text-foreground">
                    Force display (ignores weight, always shows)
                  </label>
                </div>

                <div className="pt-4 border-t border-border">
                  <button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    className="w-full px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
