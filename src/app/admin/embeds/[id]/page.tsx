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
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8 bg-gray-900 min-h-screen">
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">{error || 'Failed to load data'}</p>
        </div>
      </div>
    )
  }

  const maxCount = Math.max(...data.chartData.map(d => d.count), 1)

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <button
                onClick={() => router.push('/admin/embeds')}
                className="text-sm text-gray-400 hover:text-white mb-2 flex items-center transition-colors"
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
              <h1 className="text-2xl font-bold text-white">
                {data.embed.displayName || data.embed.title}
              </h1>
              <p className="text-sm text-gray-400 mt-1">Embed Analytics</p>
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
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-700 text-gray-300 border border-gray-600 hover:border-pink-500 hover:bg-gray-700/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content - Full Width */}
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards - Plausible Style */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 mb-8">
          {/* Impressions */}
          <div className="bg-gray-800 border-l-4 border-pink-500 px-3 py-2">
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
              Impressions
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <div className="text-xl font-bold text-white">
                {data.impressions.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Clicks */}
          <div className="bg-gray-800 border-l-4 border-pink-500 px-3 py-2">
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
              Clicks
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <div className="text-xl font-bold text-white">
                {data.clicks.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Click Rate */}
          <div className="bg-gray-800 border-l-4 border-pink-500 px-3 py-2">
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
              Click Rate
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <div className="text-xl font-bold text-white">
                {data.ctr.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* Preview Section */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Preview</h2>
          <div className="flex justify-center">
            <div className="w-full max-w-2xl aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
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
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-6">Activity Over Time</h2>
          <div className="h-64 flex items-end gap-1">
            {data.chartData.length > 0 ? (
              data.chartData.map((point) => {
                const height = (point.count / maxCount) * 100
                return (
                  <div
                    key={point.date}
                    className="flex-1 group relative cursor-pointer"
                  >
                    <div
                      className="bg-pink-600 group-hover:bg-pink-500 rounded-t transition-colors w-full"
                      style={{ height: `${height}%`, minHeight: point.count > 0 ? '4px' : '0' }}
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      <div className="bg-gray-950 text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap border border-gray-700">
                        <div className="font-semibold">{point.count.toLocaleString()} views</div>
                        <div className="text-gray-400 text-xs mt-1">
                          {new Date(point.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-950 border-r border-b border-gray-700"></div>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="flex items-center justify-center w-full text-gray-400">
                No data for this period
              </div>
            )}
          </div>
          {data.chartData.length > 0 && (
            <div className="flex justify-between mt-4 text-xs text-gray-400 border-t border-gray-700 pt-4">
              <span>{new Date(data.chartData[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span>{new Date(data.chartData[data.chartData.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          )}
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Details Section */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Details</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-400">Title</label>
                <div className="text-white mt-1">{data.embed.title}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400">Display Name</label>
                <div className="text-white mt-1">
                  {data.embed.displayName || '(using title)'}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400">Video ID</label>
                <div className="text-white font-mono text-sm mt-1">{data.embed.videoId}</div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-400">Redirect URL</label>
                <a
                  href={data.embed.redirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink-500 hover:text-pink-400 truncate block mt-1 text-sm"
                >
                  {data.embed.redirectUrl}
                </a>
              </div>
            </div>
          </div>

          {/* Top Domains */}
          {Object.keys(data.domainBreakdown).length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Top Domains</h3>
              <div className="space-y-3">
                {Object.entries(data.domainBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 5)
                  .map(([domain, count]) => (
                    <div key={domain} className="flex justify-between items-center">
                      <span className="text-gray-300 truncate text-sm">{domain || 'Direct'}</span>
                      <span className="text-white font-semibold ml-2">{count.toLocaleString()}</span>
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
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Browsers</h3>
              <div className="space-y-3">
                {data.browsers.map(b => (
                  <div key={b.browser} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-300 text-sm">{b.browser}</span>
                      <span className="text-xs text-gray-500">({b.percentage}%)</span>
                    </div>
                    <span className="text-white font-semibold">
                      {b.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Devices */}
          {data.devices.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Devices</h3>
              <div className="space-y-3">
                {data.devices.map(d => (
                  <div key={d.device} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-300 text-sm">{d.device}</span>
                      <span className="text-xs text-gray-500">({d.percentage}%)</span>
                    </div>
                    <span className="text-white font-semibold">
                      {d.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Operating Systems */}
          {data.operatingSystems.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Operating Systems</h3>
              <div className="space-y-3">
                {data.operatingSystems.map(os => (
                  <div key={os.os} className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-300 text-sm">{os.os}</span>
                      <span className="text-xs text-gray-500">({os.percentage}%)</span>
                    </div>
                    <span className="text-white font-semibold">
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
