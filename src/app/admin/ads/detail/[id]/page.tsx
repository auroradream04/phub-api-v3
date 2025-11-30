'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Hls from 'hls.js'
import { AreaChart } from '@/components/ui/area-chart'
import { StatsDetailModal, StatsType, getBrowserIcon, getDeviceIcon, getOSIcon } from '@/components/ui/stats-detail-modal'

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
  const [detailModal, setDetailModal] = useState<{ type: StatsType; title: string } | null>(null)

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
      <div className="flex items-center justify-center min-h-screen bg-[#111113]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8 bg-[#111113] min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-400">{error || 'Failed to load data'}</p>
          </div>
        </div>
      </div>
    )
  }

  const formatChartLabel = (dateStr: string) => {
    const date = new Date(dateStr)
    if (timeRange <= 1) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const formatTooltipDate = (dateStr: string) => {
    const date = new Date(dateStr)
    if (timeRange <= 1) {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    }
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    })
  }

  const growthNum = parseFloat(data.stats.growth)
  const isPositiveGrowth = growthNum >= 0

  return (
    <div className="min-h-screen bg-[#111113]">
      {/* Header */}
      <div className="bg-[#18181b] border-b border-[#27272a]">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/admin/ads')}
                className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors mb-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Ads
              </button>
              <h1 className="text-xl font-semibold text-zinc-100">{data.ad.title}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  data.ad.status === 'active'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-zinc-500/10 text-zinc-400'
                }`}>
                  {data.ad.status}
                </span>
                <span className="text-sm text-zinc-500">
                  {data.ad.duration}s duration
                </span>
              </div>
            </div>

            {activeTab === 'analytics' && (
              <div className="flex items-center gap-1 bg-[#1f1f23] rounded-lg p-1">
                {TIME_RANGES.map(({ label, value }) => (
                  <button
                    key={label}
                    onClick={() => handleTimeRangeChange(value)}
                    disabled={isPending}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      timeRange === value
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#27272a]'
                    } ${isPending ? 'opacity-70' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-6 mt-4 border-t border-[#27272a] pt-4">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                activeTab === 'analytics'
                  ? 'border-purple-500 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-purple-500 text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Settings
            </button>
          </div>
        </div>
      </div>

      <div className={`max-w-7xl mx-auto p-6 transition-opacity duration-200 ${isPending ? 'opacity-60' : ''}`}>
        {activeTab === 'analytics' ? (
          <div className="space-y-6">
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4">
                <div className="text-sm text-zinc-500 mb-1">Period Impressions</div>
                <div className="text-2xl font-semibold text-zinc-100">
                  {data.stats.impressionsInPeriod.toLocaleString()}
                </div>
                <div className={`text-sm mt-1 ${isPositiveGrowth ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositiveGrowth ? '↑' : '↓'} {Math.abs(growthNum).toFixed(1)}% vs previous
                </div>
              </div>

              <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4">
                <div className="text-sm text-zinc-500 mb-1">Total Impressions</div>
                <div className="text-2xl font-semibold text-zinc-100">
                  {data.stats.totalImpressions.toLocaleString()}
                </div>
                <div className="text-sm text-zinc-500 mt-1">All time</div>
              </div>

              <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4">
                <div className="text-sm text-zinc-500 mb-1">Unique Videos</div>
                <div className="text-2xl font-semibold text-zinc-100">
                  {data.topVideos.length}
                </div>
                <div className="text-sm text-zinc-500 mt-1">In period</div>
              </div>

              <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4">
                <div className="text-sm text-zinc-500 mb-1">Top Source</div>
                <div className="text-lg font-semibold text-zinc-100 truncate">
                  {data.topSources[0]?.source || 'N/A'}
                </div>
                <div className="text-sm text-zinc-500 mt-1">
                  {data.topSources[0]?.count.toLocaleString() || 0} views
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-zinc-100">
                  {timeRange <= 1 ? 'Hourly' : 'Daily'} Views
                </h2>
                <span className="text-sm text-zinc-500">
                  {new Date(data.period.startDate).toLocaleDateString()} - {new Date(data.period.endDate).toLocaleDateString()}
                </span>
              </div>

              <AreaChart
                data={data.chartData}
                height={256}
                formatLabel={formatChartLabel}
                formatTooltipDate={formatTooltipDate}
                valueLabel="IMPRESSIONS"
              />
            </div>

            {/* Two Column Layout */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Top Sources */}
              <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-5 flex flex-col">
                <h2 className="text-base font-semibold text-zinc-100 mb-4">Top Sources</h2>
                {data.topSources.length > 0 ? (
                  <div className="space-y-3 flex-1">
                    {data.topSources.slice(0, 10).map((source, i) => {
                      const maxSourceCount = data.topSources[0]?.count || 1
                      const width = (source.count / maxSourceCount) * 100

                      return (
                        <div key={i} className="group">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-zinc-100 truncate pr-2">{source.source}</span>
                            <span className="text-zinc-500 font-medium">{source.count.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 bg-[#1f1f23] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500/60 rounded-full transition-all"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 flex-1">No data</p>
                )}
                {data.topSources.length > 10 && (
                  <button
                    onClick={() => setDetailModal({ type: 'sources', title: 'Top Sources' })}
                    className="mt-4 pt-3 border-t border-[#27272a] text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    DETAILS
                  </button>
                )}
              </div>

              {/* Top Videos */}
              <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-5 flex flex-col">
                <h2 className="text-base font-semibold text-zinc-100 mb-4">Top Videos</h2>
                {data.topVideos.length > 0 ? (
                  <div className="space-y-3 flex-1">
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
                              className="text-purple-400 hover:text-purple-300 truncate pr-2 transition-colors"
                            >
                              {video.videoId}
                            </a>
                            <span className="text-zinc-500 font-medium">{video.count.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 bg-[#1f1f23] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500/60 rounded-full transition-all"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 flex-1">No data</p>
                )}
                {data.topVideos.length > 10 && (
                  <button
                    onClick={() => setDetailModal({ type: 'videos', title: 'Top Videos' })}
                    className="mt-4 pt-3 border-t border-[#27272a] text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    DETAILS
                  </button>
                )}
              </div>
            </div>

            {/* Two Column Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Devices */}
              <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4 flex flex-col">
                <h3 className="text-sm font-semibold text-zinc-100 mb-3">Devices</h3>
                {data.devices.length > 0 ? (
                  <div className="space-y-1 flex-1">
                    {data.devices.slice(0, 5).map((device, i) => (
                      <div key={i} className="relative py-1.5 px-2 -mx-2 rounded">
                        <div
                          className="absolute inset-y-0 left-0 bg-purple-500/10 rounded"
                          style={{ width: `${parseFloat(device.percentage)}%` }}
                        />
                        <div className="relative flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-zinc-300">
                            {getDeviceIcon(device.device)}
                            <span>{device.device}</span>
                          </span>
                          <span className="text-zinc-100 font-medium">{device.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 flex-1">No data</p>
                )}
                {data.devices.length > 0 && (
                  <button
                    onClick={() => setDetailModal({ type: 'devices', title: 'Devices' })}
                    className="mt-3 pt-3 border-t border-[#27272a] text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    DETAILS
                  </button>
                )}
              </div>

              {/* Browsers */}
              <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4 flex flex-col">
                <h3 className="text-sm font-semibold text-zinc-100 mb-3">Browsers</h3>
                {data.browsers.length > 0 ? (
                  <div className="space-y-1 flex-1">
                    {data.browsers.slice(0, 5).map((browser, i) => (
                      <div key={i} className="relative py-1.5 px-2 -mx-2 rounded">
                        <div
                          className="absolute inset-y-0 left-0 bg-purple-500/10 rounded"
                          style={{ width: `${parseFloat(browser.percentage)}%` }}
                        />
                        <div className="relative flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-zinc-300">
                            {getBrowserIcon(browser.browser)}
                            <span>{browser.browser}</span>
                          </span>
                          <span className="text-zinc-100 font-medium">{browser.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 flex-1">No data</p>
                )}
                {data.browsers.length > 0 && (
                  <button
                    onClick={() => setDetailModal({ type: 'browsers', title: 'Browsers' })}
                    className="mt-3 pt-3 border-t border-[#27272a] text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    DETAILS
                  </button>
                )}
              </div>

              {/* Operating Systems */}
              <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4 flex flex-col">
                <h3 className="text-sm font-semibold text-zinc-100 mb-3">OS</h3>
                {data.operatingSystems.length > 0 ? (
                  <div className="space-y-1 flex-1">
                    {data.operatingSystems.slice(0, 5).map((os, i) => (
                      <div key={i} className="relative py-1.5 px-2 -mx-2 rounded">
                        <div
                          className="absolute inset-y-0 left-0 bg-purple-500/10 rounded"
                          style={{ width: `${parseFloat(os.percentage)}%` }}
                        />
                        <div className="relative flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-zinc-300">
                            {getOSIcon(os.os)}
                            <span>{os.os}</span>
                          </span>
                          <span className="text-zinc-100 font-medium">{os.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 flex-1">No data</p>
                )}
                {data.operatingSystems.length > 0 && (
                  <button
                    onClick={() => setDetailModal({ type: 'os', title: 'Operating Systems' })}
                    className="mt-3 pt-3 border-t border-[#27272a] text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    DETAILS
                  </button>
                )}
              </div>

              {/* Countries */}
              <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-4 flex flex-col">
                <h3 className="text-sm font-semibold text-zinc-100 mb-3">Countries</h3>
                {data.countries.length > 0 ? (
                  <div className="space-y-1 flex-1">
                    {data.countries.slice(0, 5).map((country, i) => (
                      <div key={i} className="relative py-1.5 px-2 -mx-2 rounded">
                        <div
                          className="absolute inset-y-0 left-0 bg-purple-500/10 rounded"
                          style={{ width: `${parseFloat(country.percentage)}%` }}
                        />
                        <div className="relative flex items-center justify-between text-sm">
                          <span className="text-zinc-300">{country.country}</span>
                          <span className="text-zinc-100 font-medium">{country.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 flex-1">No data</p>
                )}
                {data.countries.length > 0 && (
                  <button
                    onClick={() => setDetailModal({ type: 'countries', title: 'Countries' })}
                    className="mt-3 pt-3 border-t border-[#27272a] text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    DETAILS
                  </button>
                )}
              </div>
            </div>

            {/* Ad Preview */}
            <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-5">
              <h2 className="text-base font-semibold text-zinc-100 mb-4">Ad Preview</h2>
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
            <div className="bg-[#18181b] rounded-lg border border-[#27272a] p-6">
              <h2 className="text-base font-semibold text-zinc-100 mb-6">Ad Settings</h2>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2.5 bg-[#1f1f23] border border-[#27272a] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2.5 bg-[#1f1f23] border border-[#27272a] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors resize-none outline-none"
                    placeholder="Optional description"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2.5 bg-[#1f1f23] border border-[#27272a] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors outline-none"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Weight
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={formData.weight}
                      onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2.5 bg-[#1f1f23] border border-[#27272a] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors outline-none"
                    />
                    <p className="text-xs text-zinc-500 mt-1">Higher = more likely to show</p>
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="forceDisplay"
                    checked={formData.forceDisplay}
                    onChange={(e) => setFormData({ ...formData, forceDisplay: e.target.checked })}
                    className="h-4 w-4 text-purple-500 bg-[#1f1f23] border-[#27272a] rounded focus:ring-purple-500/20"
                  />
                  <label htmlFor="forceDisplay" className="ml-2 text-sm text-zinc-300">
                    Force display (ignores weight, always shows)
                  </label>
                </div>

                <div className="pt-4 border-t border-[#27272a]">
                  <button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Detail Modal */}
      {detailModal && data && (
        <StatsDetailModal
          isOpen={!!detailModal}
          onClose={() => setDetailModal(null)}
          title={detailModal.title}
          type={detailModal.type}
          data={
            detailModal.type === 'sources'
              ? data.topSources.map(s => ({ name: s.source, count: s.count }))
              : detailModal.type === 'videos'
              ? data.topVideos.map(v => ({ name: v.videoId, count: v.count }))
              : detailModal.type === 'browsers'
              ? data.browsers.map(b => ({ name: b.browser, count: b.count, percentage: b.percentage }))
              : detailModal.type === 'devices'
              ? data.devices.map(d => ({ name: d.device, count: d.count, percentage: d.percentage }))
              : detailModal.type === 'os'
              ? data.operatingSystems.map(o => ({ name: o.os, count: o.count, percentage: o.percentage }))
              : data.countries.map(c => ({ name: c.country, count: c.count, percentage: c.percentage }))
          }
          totalCount={data.stats.impressionsInPeriod}
        />
      )}
    </div>
  )
}
