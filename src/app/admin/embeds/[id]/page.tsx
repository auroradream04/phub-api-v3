'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import VideoPreview from '@/components/VideoPreview'

interface Analytics {
  embedId: string
  embed: {
    title: string
    displayName?: string
    videoId: string
    preview: string
    previewVideo?: string
    redirectUrl: string
  }
  impressions: number
  clicks: number
  ctr: number
  domainBreakdown: Record<string, number>
  browsers: Array<{ browser: string; count: number; percentage: string }>
  devices: Array<{ device: string; count: number; percentage: string }>
  operatingSystems: Array<{ os: string; count: number; percentage: string }>
  dailyStats: Record<string, { impressions: number; clicks: number }>
  chartData: Array<{ date: string; count: number }>
  period: { from: string; to: string; days: number }
}

export default function EmbedDetailPage() {
  const params = useParams()
  const router = useRouter()
  const embedId = params.id as string

  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState(7)
  const [chartMetric, setChartMetric] = useState<'impressions' | 'clicks'>('impressions')

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/admin/embeds/${embedId}/analytics?days=${timeRange}`)

        if (!response.ok) {
          throw new Error('Failed to fetch data')
        }

        const result: Analytics = await response.json()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [embedId, timeRange])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8 bg-background min-h-screen">
        <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
          <p className="text-destructive">{error || 'Failed to load data'}</p>
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
                onClick={() => router.push('/admin/embeds')}
                className="text-sm text-muted-foreground hover:text-foreground mb-2 flex items-center transition-colors"
              >
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back to Embeds
              </button>
              <h1 className="text-2xl font-bold text-foreground">
                {data.embed.displayName || data.embed.title}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Embed Analytics</p>
            </div>
          </div>

          {/* Time Range Selector */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: '1d', value: 1 },
              { label: '7d', value: 7 },
              { label: '30d', value: 30 },
              { label: '90d', value: 90 },
            ].map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setTimeRange(value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  timeRange === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-foreground border border-border hover:border-primary hover:bg-card/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content - Full Width */}
      <div className="py-8">
        {/* Stats Cards - Plausible Style */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 mb-8">
          {/* Impressions */}
          <div className="bg-card border-l-4 border-primary px-3 py-2">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Impressions
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <div className="text-xl font-bold text-foreground">
                {data.impressions.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Clicks */}
          <div className="bg-card border-l-4 border-primary px-3 py-2">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Clicks
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <div className="text-xl font-bold text-foreground">
                {data.clicks.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Click Rate */}
          <div className="bg-card border-l-4 border-primary px-3 py-2">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Click Rate
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <div className="text-xl font-bold text-foreground">
                {data.ctr.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* Preview Section */}
        <div className="bg-card rounded-lg border border-border p-6 mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">Preview</h2>
          <div className="flex justify-center">
            <div className="w-full max-w-2xl aspect-video bg-background rounded-lg overflow-hidden border border-border">
              <VideoPreview
                preview={data.embed.preview}
                previewVideo={data.embed.previewVideo}
                title={data.embed.title}
                duration=""
              />
            </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="bg-card rounded-lg border border-border p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">Activity Over Time</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setChartMetric('impressions')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  chartMetric === 'impressions'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-foreground border border-border hover:border-primary'
                }`}
              >
                Impressions
              </button>
              <button
                onClick={() => setChartMetric('clicks')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  chartMetric === 'clicks'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-foreground border border-border hover:border-primary'
                }`}
              >
                Clicks
              </button>
            </div>
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
                            <div className="font-semibold">{point.count.toLocaleString()} {chartMetric}</div>
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

        {/* Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Details Section */}
          <div className="bg-card rounded-lg border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Title</label>
                <div className="text-foreground mt-1">{data.embed.title}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Display Name</label>
                <div className="text-foreground mt-1">
                  {data.embed.displayName || '(using title)'}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Video ID</label>
                <div className="text-foreground font-mono text-sm mt-1">{data.embed.videoId}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Redirect URL</label>
                <a
                  href={data.embed.redirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 truncate block mt-1 text-sm"
                >
                  {data.embed.redirectUrl}
                </a>
              </div>
            </div>
          </div>

          {/* Top Domains */}
          {Object.keys(data.domainBreakdown).length > 0 && (
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Top Domains</h3>
              <div className="space-y-3">
                {Object.entries(data.domainBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([domain, count]) => (
                    <div key={domain} className="flex justify-between items-center">
                      <span className="text-foreground truncate text-sm">{domain || 'Direct'}</span>
                      <span className="text-foreground font-semibold ml-2">{count.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Grid - Devices, Browsers, OS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Browsers */}
          {data.browsers.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Browsers</h3>
              <div className="space-y-3">
                {data.browsers.map(b => (
                  <div key={b.browser} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm">{b.browser}</span>
                      <span className="text-xs text-muted-foreground">({b.percentage}%)</span>
                    </div>
                    <span className="text-foreground font-semibold">
                      {b.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Devices */}
          {data.devices.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Devices</h3>
              <div className="space-y-3">
                {data.devices.map(d => (
                  <div key={d.device} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm">{d.device}</span>
                      <span className="text-xs text-muted-foreground">({d.percentage}%)</span>
                    </div>
                    <span className="text-foreground font-semibold">
                      {d.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Operating Systems */}
          {data.operatingSystems.length > 0 && (
            <div className="bg-card rounded-lg border border-border p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Operating Systems</h3>
              <div className="space-y-3">
                {data.operatingSystems.map(os => (
                  <div key={os.os} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm">{os.os}</span>
                      <span className="text-xs text-muted-foreground">({os.percentage}%)</span>
                    </div>
                    <span className="text-foreground font-semibold">
                      {os.count.toLocaleString()}
                    </span>
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
