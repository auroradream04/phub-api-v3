'use client'

import { useState } from 'react'

export default function TestStreamPage() {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'cors' | 'full' | 'passthrough'>('cors')
  const [ads, setAds] = useState(true)
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const testStream = async () => {
    if (!url) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const proxyUrl = `/api/stream/proxy?url=${encodeURIComponent(url)}&mode=${mode}&ads=${ads}`
      const response = await fetch(proxyUrl)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const m3u8 = await response.text()
      setResult(m3u8)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const testVodProxy = async () => {
    if (!url) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const proxyUrl = `/api/provide/proxy?url=${encodeURIComponent(url)}`
      const response = await fetch(proxyUrl)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.text()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const playableUrl = url ?
    `${window.location.origin}/api/stream/proxy?url=${encodeURIComponent(url)}&mode=${mode}&ads=${ads}` : ''

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Stream Proxy Tester</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">URL to test:</label>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://cdn.example.com/video/index.m3u8 or VOD API URL"
            className="w-full p-2 border rounded bg-background"
          />
        </div>

        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Mode:</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'cors' | 'full' | 'passthrough')}
              className="p-2 border rounded bg-background"
            >
              <option value="cors">CORS Proxy (external)</option>
              <option value="full">Full Proxy (through md8av)</option>
              <option value="passthrough">Passthrough (direct URLs)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Ads:</label>
            <select
              value={ads ? 'true' : 'false'}
              onChange={(e) => setAds(e.target.value === 'true')}
              className="p-2 border rounded bg-background"
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={testStream}
            disabled={loading || !url}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Test Stream Proxy'}
          </button>

          <button
            onClick={testVodProxy}
            disabled={loading || !url}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Test VOD Proxy'}
          </button>
        </div>

        {playableUrl && (
          <div className="p-3 bg-muted rounded">
            <label className="block text-sm font-medium mb-1">Playable URL:</label>
            <code className="text-xs break-all">{playableUrl}</code>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && (
          <div>
            <label className="block text-sm font-medium mb-1">Result:</label>
            <pre className="p-4 bg-muted rounded overflow-auto max-h-96 text-xs">
              {result.length > 10000 ? result.substring(0, 10000) + '\n\n... (truncated)' : result}
            </pre>
          </div>
        )}
      </div>

      <div className="mt-8 p-4 bg-muted rounded">
        <h2 className="font-bold mb-2">Mode Explanation:</h2>
        <ul className="text-sm space-y-2">
          <li><strong>CORS Proxy:</strong> Segments go through external CORS proxy (cors.freechatnow.net). Fast but relies on third-party.</li>
          <li><strong>Full Proxy:</strong> Segments go through md8av.com/api/stream/segment. More reliable, uses your bandwidth.</li>
          <li><strong>Passthrough:</strong> Direct URLs to CDN. Only works if CDN allows CORS or for non-browser players.</li>
        </ul>
      </div>
    </div>
  )
}
