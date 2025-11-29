'use client'

import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Play, Square, ChevronDown } from 'lucide-react'

interface MigrationStats {
  total: number
  migrated: number
  pending: number
  failed: number
  noImage: number
  percentComplete: number
}

interface DiskStats {
  count: number
  totalSizeBytes: number
  totalSizeMB: number
}

interface Failure {
  vodId: string
  originalUrl: string
  error: string
  recoveryAttempted?: boolean
}

export function ThumbnailMigration() {
  const [stats, setStats] = useState<MigrationStats | null>(null)
  const [disk, setDisk] = useState<DiskStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [message, setMessage] = useState('')
  const [batchSize, setBatchSize] = useState(200)
  const [concurrency, setConcurrency] = useState(10)
  const [autoRun, setAutoRun] = useState(false)
  const [failures, setFailures] = useState<Failure[]>([])
  const [showFailures, setShowFailures] = useState(false)
  const autoRunRef = useRef(false)

  const fetchStats = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/migrate-thumbnails')
      const data = await res.json()
      if (data.success) {
        setStats(data.stats)
        setDisk(data.disk)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const fetchFailures = async () => {
    try {
      const res = await fetch('/api/admin/recover-thumbnails?limit=100')
      const data = await res.json()
      if (data.success) setFailures(data.failures)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchStats()
    fetchFailures()
  }, [])

  useEffect(() => {
    autoRunRef.current = autoRun
  }, [autoRun])

  const runMigrationBatch = async () => {
    setMigrating(true)
    setMessage('Running...')

    try {
      const res = await fetch('/api/admin/migrate-thumbnails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize, concurrency }),
      })
      const data = await res.json()

      if (data.success) {
        setMessage(`${data.succeeded}/${data.processed} (${data.avgTimePerVideo}ms/video)`)
        await fetchStats()
        await fetchFailures()

        if (autoRunRef.current && data.remaining > 0) {
          setTimeout(() => {
            if (autoRunRef.current) runMigrationBatch()
          }, 500)
        } else if (data.remaining === 0) {
          setAutoRun(false)
          setMessage('Done')
        }
      } else {
        setMessage(`Error: ${data.message}`)
        setAutoRun(false)
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Unknown'}`)
      setAutoRun(false)
    } finally {
      if (!autoRunRef.current) setMigrating(false)
    }
  }

  const runRecovery = async () => {
    setRecovering(true)
    setMessage('Recovering...')

    try {
      const res = await fetch('/api/admin/recover-thumbnails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 20, concurrency: 5 }),
      })
      const data = await res.json()

      if (data.success) {
        setMessage(`Recovered ${data.recovered}, failed ${data.stillFailed}`)
        await fetchStats()
        await fetchFailures()
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (e) {
      setMessage(`Error: ${e instanceof Error ? e.message : 'Unknown'}`)
    } finally {
      setRecovering(false)
    }
  }

  const deleteUnrecoverable = async () => {
    if (!confirm('Delete videos with unrecoverable thumbnails?')) return

    setMessage('Deleting...')
    try {
      const res = await fetch('/api/admin/recover-thumbnails', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, deleteFromDb: true }),
      })
      const data = await res.json()

      if (data.success) {
        setMessage(`Deleted ${data.deletedFromDb}`)
        await fetchStats()
        await fetchFailures()
      }
    } catch { /* ignore */ }
  }

  const stopAutoRun = () => {
    setAutoRun(false)
    autoRunRef.current = false
    setMigrating(false)
    setMessage('Stopped')
  }

  const startAutoRun = () => {
    setAutoRun(true)
    runMigrationBatch()
  }

  const estimatedTotalGB = stats ? ((stats.pending * 15) / 1024 / 1024).toFixed(1) : '0'

  return (
    <div className="p-4 bg-zinc-900/50 rounded border border-zinc-800/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-zinc-300">Thumbnail Migration</span>
        <button onClick={fetchStats} disabled={loading} className="text-zinc-500 hover:text-zinc-300">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-6 text-xs mb-4">
        <div>
          <span className="text-zinc-500">Total</span>
          <span className="ml-2 text-zinc-100">{stats?.total.toLocaleString() || '-'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Migrated</span>
          <span className="ml-2 text-emerald-400">{stats?.migrated.toLocaleString() || '-'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Pending</span>
          <span className="ml-2 text-zinc-100">{stats?.pending.toLocaleString() || '-'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Failed</span>
          <span className="ml-2 text-red-400">{stats?.failed || '-'}</span>
        </div>
      </div>

      {/* Progress bar */}
      {stats && stats.total > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>{stats.percentComplete.toFixed(1)}%</span>
            <span>{disk?.totalSizeMB.toFixed(1)} MB / ~{estimatedTotalGB} GB</span>
          </div>
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-500 transition-all"
              style={{ width: `${stats.percentComplete}%` }}
            />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Batch</span>
          <input
            type="number"
            value={batchSize}
            onChange={(e) => setBatchSize(Math.min(500, Math.max(10, parseInt(e.target.value) || 100)))}
            className="w-16 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-100"
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Concurrency</span>
          <input
            type="number"
            value={concurrency}
            onChange={(e) => setConcurrency(Math.min(20, Math.max(1, parseInt(e.target.value) || 10)))}
            className="w-12 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-100"
          />
        </div>
        {message && <span className="text-xs text-zinc-400">{message}</span>}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!autoRun ? (
          <>
            <button
              onClick={runMigrationBatch}
              disabled={migrating || !stats?.pending}
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded text-xs"
            >
              <Play className="w-3 h-3" />
              Run Batch
            </button>
            <button
              onClick={startAutoRun}
              disabled={migrating || !stats?.pending}
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded text-xs"
            >
              <RefreshCw className="w-3 h-3" />
              Auto-Run
            </button>
          </>
        ) : (
          <button
            onClick={stopAutoRun}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-900/50 hover:bg-red-900 rounded text-xs"
          >
            <Square className="w-3 h-3" />
            Stop
          </button>
        )}

        {stats && stats.failed > 0 && (
          <>
            <button
              onClick={runRecovery}
              disabled={recovering}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded text-xs"
            >
              {recovering ? 'Recovering...' : 'Recover Failed'}
            </button>
            <button
              onClick={() => setShowFailures(!showFailures)}
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showFailures ? 'rotate-180' : ''}`} />
              Failures ({stats.failed})
            </button>
          </>
        )}
      </div>

      {/* Failures list */}
      {showFailures && failures.length > 0 && (
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">Failed thumbnails</span>
            <button onClick={deleteUnrecoverable} className="text-xs text-red-400 hover:text-red-300">
              Delete unrecoverable
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
            {failures.slice(0, 20).map((f) => (
              <div key={f.vodId} className="flex items-center justify-between py-1 text-zinc-400">
                <span className="font-mono">{f.vodId}</span>
                <span className={f.recoveryAttempted ? 'text-red-400' : 'text-zinc-500'}>
                  {f.recoveryAttempted ? 'unrecoverable' : 'pending'}
                </span>
              </div>
            ))}
            {failures.length > 20 && (
              <div className="text-zinc-600">+{failures.length - 20} more</div>
            )}
          </div>
        </div>
      )}

      {/* Completion */}
      {stats?.pending === 0 && stats?.migrated > 0 && (
        <div className="mt-4 text-xs text-emerald-400">
          Migration complete - {stats.migrated.toLocaleString()} thumbnails
        </div>
      )}
    </div>
  )
}
