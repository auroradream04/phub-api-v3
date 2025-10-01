'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface Ad {
  id: string
  title: string
  status: string
  weight: number
  forceDisplay: boolean
  duration: number
  previewUrl: string | null
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
  chartData: ChartDataPoint[]
  period: {
    days: number
    startDate: string
    endDate: string
  }
}

export default function AdAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const adId = params.id as string

  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState(7)

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/admin/ads/analytics/${adId}?days=${timeRange}`)

        if (!response.ok) {
          throw new Error('Failed to fetch analytics')
        }

        const result = await response.json()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics')
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [adId, timeRange])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error || 'Failed to load analytics'}</p>
        </div>
      </div>
    )
  }

  const maxCount = Math.max(...data.chartData.map(d => d.count), 1)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/admin/ads')}
                className="text-sm text-gray-500 hover:text-gray-700 mb-2 flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Ads
              </button>
              <h1 className="text-2xl font-bold text-gray-900">{data.ad.title}</h1>
              <p className="text-sm text-gray-500 mt-1">Ad Analytics</p>
            </div>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(Number(e.target.value))}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Ad Preview */}
        {data.ad.previewUrl && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Ad Preview</h2>
            <div className="flex justify-center">
              <video
                controls
                className="max-w-2xl w-full rounded-lg border border-gray-200"
                src={data.ad.previewUrl}
              >
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
              Total Views
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.stats.totalImpressions.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500 mt-1">All time</div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
              Views in Period
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {data.stats.impressionsInPeriod.toLocaleString()}
            </div>
            <div className="text-sm text-green-600 mt-1">
              ↑ {data.stats.growth}% of total
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
              Status
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                data.ad.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {data.ad.status}
              </span>
              {data.ad.forceDisplay && (
                <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">
                  Forced
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 mt-1">Weight: {data.ad.weight}</div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Views Over Time</h2>
          <div className="h-64 flex items-end justify-between gap-1 relative">
            {data.chartData.length > 0 ? (
              data.chartData.map((point, index) => {
                const height = (point.count / maxCount) * 100
                return (
                  <div
                    key={point.date}
                    className="flex-1 group relative flex items-end"
                  >
                    <div
                      className="bg-blue-500 hover:bg-blue-600 rounded-t transition-all cursor-pointer w-full"
                      style={{ height: `${height}%`, minHeight: point.count > 0 ? '4px' : '0' }}
                    />
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                        <div className="font-semibold">{point.count.toLocaleString()} views</div>
                        <div className="text-gray-300 text-xs mt-1">
                          {new Date(point.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="flex items-center justify-center w-full h-full text-gray-400">
                No data for this period
              </div>
            )}
          </div>
          {data.chartData.length > 0 && (
            <div className="flex justify-between mt-4 text-xs text-gray-500 border-t border-gray-100 pt-4">
              <span>{new Date(data.chartData[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span>{new Date(data.chartData[data.chartData.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          )}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Sources */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Sources</h2>
            {data.topSources.length > 0 ? (
              <div className="space-y-3">
                {data.topSources.map((source, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {source.source === 'direct' ? (
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                      )}
                      <span className="text-sm text-gray-700 truncate">
                        {source.source}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 ml-2">
                      {source.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No sources data</p>
            )}
          </div>

          {/* Top Videos */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Videos</h2>
            {data.topVideos.length > 0 ? (
              <div className="space-y-3">
                {data.topVideos.map((video, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <a
                        href={`/watch/${video.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-700 truncate"
                      >
                        {video.videoId}
                      </a>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 ml-2">
                      {video.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No videos data</p>
            )}
          </div>

          {/* Browsers */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Browsers</h2>
            {data.browsers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {data.browsers.map((browser, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{browser.browser}</span>
                      <span className="text-xs text-gray-500">{browser.percentage}%</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                      {browser.count.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">No browser data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
