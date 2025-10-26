'use client'

import { useState, useEffect, useRef } from 'react'
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  // Settings form state
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
        setLoading(true)
        const response = await fetch(`/api/admin/ads/detail/${adId}?days=${timeRange}`)

        if (!response.ok) {
          throw new Error('Failed to fetch data')
        }

        const result = await response.json()
        setData(result)

        // Initialize form with current ad data
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

  // Setup HLS player
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
      // Native HLS support (Safari)
      video.src = playlistUrl
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
    }
  }, [data?.ad.id])

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

      // Refresh data
      const result = await response.json()
      if (data) {
        setData({
          ...data,
          ad: { ...data.ad, ...result }
        })
      }

      alert('Settings saved successfully!')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8 bg-background min-h-screen">
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">{error || 'Failed to load data'}</p>
        </div>
      </div>
    )
  }

  const maxCount = Math.max(...data.chartData.map(d => d.count), 1)

  // Dynamic y-axis scaling
  const getScaledMax = (max: number) => {
    if (max === 0) return 10
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
    const scaled = Math.ceil(max / magnitude) * magnitude
    return scaled
  }

  const scaledMax = getScaledMax(maxCount)
  const yAxisValues = [scaledMax, scaledMax * 0.75, scaledMax * 0.5, scaledMax * 0.25, 0]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <button
                onClick={() => router.push('/admin/ads')}
                className="text-sm text-muted-foreground hover:text-foreground mb-2 flex items-center transition-colors"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Ads
              </button>
              <h1 className="text-2xl font-bold text-foreground">{data.ad.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">Ad Management</p>
            </div>
            {activeTab === 'analytics' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTimeRange(0.021)} // ~30 minutes in days
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    timeRange === 0.021
                      ? 'bg-primary text-foreground'
                      : 'bg-card text-foreground border border-border hover:border-pink-500'
                  }`}
                >
                  30m
                </button>
                <button
                  onClick={() => setTimeRange(0.042)} // ~1 hour in days
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    timeRange === 0.042
                      ? 'bg-primary text-foreground'
                      : 'bg-card text-foreground border border-border hover:border-pink-500'
                  }`}
                >
                  1h
                </button>
                <button
                  onClick={() => setTimeRange(1)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    timeRange === 1
                      ? 'bg-primary text-foreground'
                      : 'bg-card text-foreground border border-border hover:border-pink-500'
                  }`}
                >
                  1d
                </button>
                <button
                  onClick={() => setTimeRange(7)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    timeRange === 7
                      ? 'bg-primary text-foreground'
                      : 'bg-card text-foreground border border-border hover:border-pink-500'
                  }`}
                >
                  7d
                </button>
                <button
                  onClick={() => setTimeRange(30)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    timeRange === 30
                      ? 'bg-primary text-foreground'
                      : 'bg-card text-foreground border border-border hover:border-pink-500'
                  }`}
                >
                  30d
                </button>
                <button
                  onClick={() => setTimeRange(90)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    timeRange === 90
                      ? 'bg-primary text-foreground'
                      : 'bg-card text-foreground border border-border hover:border-pink-500'
                  }`}
                >
                  90d
                </button>
                <button
                  onClick={() => setTimeRange(365)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    timeRange === 365
                      ? 'bg-primary text-foreground'
                      : 'bg-card text-foreground border border-border hover:border-pink-500'
                  }`}
                >
                  1y
                </button>
                <button
                  onClick={() => {
                    const daysSinceJan1 = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24))
                    setTimeRange(daysSinceJan1)
                  }}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    timeRange > 365
                      ? 'bg-primary text-foreground'
                      : 'bg-card text-foreground border border-border hover:border-pink-500'
                  }`}
                >
                  YTD
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex space-x-4 border-b border-border">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'analytics'
                  ? 'border-pink-500 text-pink-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Analytics
              </div>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-pink-500 text-pink-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="py-8">
        {activeTab === 'analytics' ? (
          <>
            {/* Ad Preview */}
            <div className="bg-card rounded-lg border border-border p-6 mb-8">
              <h2 className="text-lg font-semibold text-foreground mb-4">Ad Preview</h2>
              <div className="flex justify-center">
                <video
                  ref={videoRef}
                  controls
                  className="w-full rounded-lg border border-border"
                >
                  Your browser does not support HLS playback.
                </video>
              </div>
            </div>

            {/* Stats Cards - Plausible Style */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
              {/* Total Impressions (Period) */}
              <div className="bg-card border-l-4 border-pink-500 px-3 py-2">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Total Impressions
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <div className="text-xl font-bold text-foreground">
                    {data.stats.impressionsInPeriod.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-green-500">
                    ↑ {data.stats.growth}%
                  </span>
                </div>
              </div>

              {/* Total All Time */}
              <div className="bg-card border-l-4 border-pink-500 px-3 py-2">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Total (All Time)
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <div className="text-xl font-bold text-foreground">
                    {data.stats.totalImpressions.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Unique Videos */}
              <div className="bg-card border-l-4 border-pink-500 px-3 py-2">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Unique Videos
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <div className="text-xl font-bold text-foreground">
                    {data.topVideos.length}
                  </div>
                </div>
              </div>

              {/* Top Source */}
              <div className="bg-card border-l-4 border-pink-500 px-3 py-2">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Top Source
                </div>
                <div className="mt-0.5">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {data.topSources[0]?.source || 'N/A'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {data.topSources[0]?.count || 0} views
                  </div>
                </div>
              </div>

              {/* Top Video */}
              <div className="bg-card border-l-4 border-pink-500 px-3 py-2">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Top Video
                </div>
                <div className="mt-0.5">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {data.topVideos[0]?.videoId.slice(0, 8) || 'N/A'}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {data.topVideos[0]?.count || 0} views
                  </div>
                </div>
              </div>

              {/* Ad Duration */}
              <div className="bg-card border-l-4 border-pink-500 px-3 py-2">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Ad Duration
                </div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <div className="text-xl font-bold text-foreground">
                    {data.ad.duration}s
                  </div>
                </div>
              </div>
            </div>

            {/* Chart - Dark Theme */}
            <div className="bg-card rounded-lg border border-border p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-foreground">Views Over Time</h2>
              </div>
              <div className="flex gap-4">
                {/* Y-axis labels */}
                <div className="flex flex-col justify-between items-end text-xs text-muted-foreground w-16">
                  <span>{yAxisValues[0].toLocaleString()}</span>
                  <span>{yAxisValues[1].toLocaleString()}</span>
                  <span>{yAxisValues[2].toLocaleString()}</span>
                  <span>{yAxisValues[3].toLocaleString()}</span>
                  <span>{yAxisValues[4].toLocaleString()}</span>
                </div>
                {/* Chart area with grid */}
                <div className="flex-1">
                  <div className="relative h-80 flex items-end gap-1 border-l border-b border-border">
                    {/* Grid lines */}
                    <div className="absolute inset-0 flex flex-col pointer-events-none">
                      <div className="flex-1 border-t border-border/30"></div>
                      <div className="flex-1 border-t border-border/30"></div>
                      <div className="flex-1 border-t border-border/30"></div>
                      <div className="flex-1 border-t border-border/30"></div>
                    </div>
                    {/* Bars */}
                    {data.chartData.length > 0 ? (
                      data.chartData.map((point) => {
                        const height = (point.count / scaledMax) * 100
                        return (
                          <div
                            key={point.date}
                            className="flex-1 group relative cursor-pointer flex flex-col justify-end"
                          >
                            <div
                              className="bg-primary group-hover:bg-primary/80 transition-colors w-full"
                              style={{ height: `${height}%`, minHeight: point.count > 0 ? '2px' : '0' }}
                            />
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                              <div className="bg-card text-foreground text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap border border-border">
                                <div className="font-semibold">{point.count.toLocaleString()} impressions</div>
                                <div className="text-muted-foreground text-xs mt-1">
                                  {new Date(point.date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="flex items-center justify-center w-full text-muted-foreground">
                        No data for this period
                      </div>
                    )}
                  </div>
                  {data.chartData.length > 0 && (
                    <div className="flex justify-between mt-4 text-xs text-muted-foreground">
                      <span>{new Date(data.chartData[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span>{new Date(data.chartData[data.chartData.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Grid Layout - Dark Theme */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Top Sources */}
              <div className="bg-card rounded-lg border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Top Sources</h2>
                {data.topSources.length > 0 ? (
                  <div className="space-y-3">
                    {data.topSources.map((source, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {source.source === 'direct' ? (
                            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                          )}
                          <span className="text-sm text-foreground truncate">
                            {source.source}
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-foreground ml-2">
                          {source.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No sources data</p>
                )}
              </div>

              {/* Top Videos */}
              <div className="bg-card rounded-lg border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Top Videos</h2>
                {data.topVideos.length > 0 ? (
                  <div className="space-y-3">
                    {data.topVideos.map((video, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <a
                            href={`/watch/${video.videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-pink-500 hover:text-pink-400 truncate transition-colors"
                          >
                            {video.videoId}
                          </a>
                        </div>
                        <span className="text-sm font-semibold text-foreground ml-2">
                          {video.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No videos data</p>
                )}
              </div>
            </div>

            {/* Second Row - Devices, OS, Browsers, Countries */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
              {/* Devices */}
              <div className="bg-card rounded-lg border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Devices</h2>
                {data.devices.length > 0 ? (
                  <div className="space-y-3">
                    {data.devices.map((device, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground">{device.device}</span>
                          <span className="text-xs text-muted-foreground">({device.percentage}%)</span>
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {device.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No device data</p>
                )}
              </div>

              {/* Operating Systems */}
              <div className="bg-card rounded-lg border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Operating Systems</h2>
                {data.operatingSystems.length > 0 ? (
                  <div className="space-y-3">
                    {data.operatingSystems.map((os, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground">{os.os}</span>
                          <span className="text-xs text-muted-foreground">({os.percentage}%)</span>
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {os.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No OS data</p>
                )}
              </div>

              {/* Browsers */}
              <div className="bg-card rounded-lg border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Browsers</h2>
                {data.browsers.length > 0 ? (
                  <div className="space-y-3">
                    {data.browsers.map((browser, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground">{browser.browser}</span>
                          <span className="text-xs text-muted-foreground">({browser.percentage}%)</span>
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {browser.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No browser data</p>
                )}
              </div>

              {/* Countries */}
              <div className="bg-card rounded-lg border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Countries</h2>
                {data.countries.length > 0 ? (
                  <div className="space-y-3">
                    {data.countries.map((country, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground">{country.country}</span>
                          <span className="text-xs text-muted-foreground">({country.percentage}%)</span>
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {country.count.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No country data</p>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Settings Tab - Dark Theme */
          <div>
            <div className="bg-card rounded-lg border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-6">Ad Settings</h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 bg-card border border-border text-foreground rounded-md focus:ring-pink-500 focus:border-pink-500 placeholder-gray-500"
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
                    className="w-full px-3 py-2 bg-card border border-border text-foreground rounded-md focus:ring-pink-500 focus:border-pink-500 placeholder-gray-500"
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
                      className="w-full px-3 py-2 bg-card border border-border text-foreground rounded-md focus:ring-pink-500 focus:border-pink-500"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Weight (Probability)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2 bg-card border border-border text-foreground rounded-md focus:ring-pink-500 focus:border-pink-500"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Higher weight = higher chance (1-100)</p>
                  </div>
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.forceDisplay}
                      onChange={(e) => setFormData({ ...formData, forceDisplay: e.target.checked })}
                      className="h-4 w-4 text-pink-600 focus:ring-pink-500 bg-card border-border rounded"
                    />
                    <span className="ml-2 text-sm text-foreground">
                      Force display (always show this ad, ignores weight)
                    </span>
                  </label>
                </div>

                <div className="pt-4 border-t border-border">
                  <button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    className="w-full px-6 py-3 bg-primary text-foreground font-medium rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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