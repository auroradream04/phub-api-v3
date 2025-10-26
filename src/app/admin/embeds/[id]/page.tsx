'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="text-3xl font-bold text-foreground">{data.impressions}</div>
            <div className="text-sm text-muted-foreground">Impressions</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="text-3xl font-bold text-foreground">{data.clicks}</div>
            <div className="text-sm text-muted-foreground">Clicks</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="text-3xl font-bold text-foreground">{data.ctr.toFixed(2)}%</div>
            <div className="text-sm text-muted-foreground">Click Rate</div>
          </div>
        </div>

        {/* Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Preview Section */}
          <div className="lg:col-span-2">
            <div className="bg-card border border-border rounded-lg p-6 mb-8">
              <h2 className="text-lg font-bold text-foreground mb-4">Preview</h2>
              <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                <VideoPreview
                  preview={data.embed.preview}
                  previewVideo={data.embed.previewVideo}
                  title={data.embed.title}
                  duration=""
                />
              </div>
            </div>

            {/* Details Section */}
            <div className="bg-card border border-border rounded-lg p-6 mb-8">
              <h2 className="text-lg font-bold text-foreground mb-4">Details</h2>
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
                  <div className="text-foreground font-mono mt-1">{data.embed.videoId}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Redirect URL</label>
                  <a
                    href={data.embed.redirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 truncate block mt-1"
                  >
                    {data.embed.redirectUrl}
                  </a>
                </div>
              </div>
            </div>

            {/* Chart Section */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-bold text-foreground mb-4">Activity Over Time</h2>
              <div className="h-64 flex items-end justify-between gap-1">
                {data.chartData.length > 0 ? (
                  data.chartData.map((point, index) => {
                    const height = (point.count / maxCount) * 100
                    return (
                      <div
                        key={index}
                        className="flex-1 bg-primary/70 hover:bg-primary rounded-t transition-colors relative group"
                        style={{ minHeight: height > 0 ? '4px' : '0', height: `${height}%` }}
                      >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-foreground text-background text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          {point.count} views on {point.date}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="w-full text-center text-muted-foreground">No data available</div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Top Domains */}
            {Object.keys(data.domainBreakdown).length > 0 && (
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-sm font-bold text-foreground mb-3">Top Domains</h3>
                <div className="space-y-2">
                  {Object.entries(data.domainBreakdown)
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

            {/* Browsers */}
            {data.browsers.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-sm font-bold text-foreground mb-3">Browsers</h3>
                <div className="space-y-2">
                  {data.browsers.map(b => (
                    <div key={b.browser} className="flex justify-between items-center text-sm">
                      <span className="text-foreground">{b.browser}</span>
                      <span className="text-muted-foreground font-medium">
                        {b.count} ({b.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Devices */}
            {data.devices.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-sm font-bold text-foreground mb-3">Devices</h3>
                <div className="space-y-2">
                  {data.devices.map(d => (
                    <div key={d.device} className="flex justify-between items-center text-sm">
                      <span className="text-foreground">{d.device}</span>
                      <span className="text-muted-foreground font-medium">
                        {d.count} ({d.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Operating Systems */}
            {data.operatingSystems.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-sm font-bold text-foreground mb-3">Operating Systems</h3>
                <div className="space-y-2">
                  {data.operatingSystems.map(os => (
                    <div key={os.os} className="flex justify-between items-center text-sm">
                      <span className="text-foreground">{os.os}</span>
                      <span className="text-muted-foreground font-medium">
                        {os.count} ({os.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
