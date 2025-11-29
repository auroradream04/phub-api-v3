'use client'

import { useState, useEffect, useRef } from 'react'
import { Image, RefreshCw, Play, AlertTriangle, CheckCircle, Trash2, HardDrive } from 'lucide-react'

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

interface MigrationResult {
  processed: number
  succeeded: number
  failed: number
  remaining: number
  timeMs: number
  avgTimePerVideo: number
}

interface Failure {
  vodId: string
  originalUrl: string
  error: string
  timestamp: string
  recoveryAttempted?: boolean
  recoveryError?: string
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
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchFailures = async () => {
    try {
      const res = await fetch('/api/admin/recover-thumbnails?limit=100')
      const data = await res.json()
      if (data.success) {
        setFailures(data.failures)
      }
    } catch (error) {
      console.error('Failed to fetch failures:', error)
    }
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
    setMessage('Running migration batch...')

    try {
      const res = await fetch('/api/admin/migrate-thumbnails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize, concurrency }),
      })
      const data: MigrationResult & { success: boolean; message?: string } = await res.json()

      if (data.success) {
        setMessage(
          `✓ Processed ${data.processed}: ${data.succeeded} succeeded, ${data.failed} failed (${data.avgTimePerVideo}ms/video)`
        )
        await fetchStats()
        await fetchFailures()

        // Continue if autoRun is enabled and there are more to process
        if (autoRunRef.current && data.remaining > 0) {
          setTimeout(() => {
            if (autoRunRef.current) {
              runMigrationBatch()
            }
          }, 500)
        } else if (data.remaining === 0) {
          setAutoRun(false)
          setMessage('✓ Migration complete!')
        }
      } else {
        setMessage(`✗ Error: ${data.message}`)
        setAutoRun(false)
      }
    } catch (error) {
      setMessage(`✗ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setAutoRun(false)
    } finally {
      if (!autoRunRef.current) {
        setMigrating(false)
      }
    }
  }

  const runRecovery = async () => {
    setRecovering(true)
    setMessage('Attempting to recover failed thumbnails...')

    try {
      const res = await fetch('/api/admin/recover-thumbnails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 20, concurrency: 5 }),
      })
      const data = await res.json()

      if (data.success) {
        setMessage(
          `✓ Recovery: ${data.recovered} recovered, ${data.stillFailed} still failed`
        )
        await fetchStats()
        await fetchFailures()
      } else {
        setMessage(`✗ Recovery failed: ${data.error}`)
      }
    } catch (error) {
      setMessage(`✗ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setRecovering(false)
    }
  }

  const deleteUnrecoverable = async () => {
    if (!confirm('Delete all videos with unrecoverable thumbnails from the database? This cannot be undone.')) {
      return
    }

    setMessage('Deleting unrecoverable videos...')

    try {
      const res = await fetch('/api/admin/recover-thumbnails', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, deleteFromDb: true }),
      })
      const data = await res.json()

      if (data.success) {
        setMessage(`✓ Deleted ${data.deletedFromDb} videos from database`)
        await fetchStats()
        await fetchFailures()
      } else {
        setMessage(`✗ Delete failed: ${data.error}`)
      }
    } catch (error) {
      setMessage(`✗ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const stopAutoRun = () => {
    setAutoRun(false)
    autoRunRef.current = false
    setMigrating(false)
    setMessage('Stopped auto-migration')
  }

  const startAutoRun = () => {
    setAutoRun(true)
    runMigrationBatch()
  }

  const estimatedTotalSize = stats ? Math.round((stats.pending * 15) / 1024) : 0 // ~15KB per image

  return (
    <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-2xl p-8 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10">
            <Image className="w-6 h-6 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Thumbnail Migration</h2>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-muted/30 rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Videos</p>
          <p className="text-2xl font-bold">{stats?.total.toLocaleString() || '-'}</p>
        </div>
        <div className="bg-emerald-500/10 rounded-xl p-4">
          <p className="text-xs text-emerald-600 uppercase tracking-wider mb-1">Migrated</p>
          <p className="text-2xl font-bold text-emerald-600">{stats?.migrated.toLocaleString() || '-'}</p>
        </div>
        <div className="bg-blue-500/10 rounded-xl p-4">
          <p className="text-xs text-blue-600 uppercase tracking-wider mb-1">Pending</p>
          <p className="text-2xl font-bold text-blue-600">{stats?.pending.toLocaleString() || '-'}</p>
        </div>
        <div className="bg-red-500/10 rounded-xl p-4">
          <p className="text-xs text-red-600 uppercase tracking-wider mb-1">Failed</p>
          <p className="text-2xl font-bold text-red-600">{stats?.failed || '-'}</p>
        </div>
      </div>

      {/* Progress Bar */}
      {stats && stats.total > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{stats.percentComplete.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${stats.percentComplete}%` }}
            />
          </div>
        </div>
      )}

      {/* Disk Usage */}
      {disk && (
        <div className="flex items-center gap-4 mb-6 p-4 bg-muted/30 rounded-xl">
          <HardDrive className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {disk.count.toLocaleString()} files · {disk.totalSizeMB.toFixed(2)} MB used
            </p>
            <p className="text-xs text-muted-foreground">
              Estimated total: ~{estimatedTotalSize} MB ({(estimatedTotalSize / 1024).toFixed(1)} GB)
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Batch:</label>
          <input
            type="number"
            value={batchSize}
            onChange={(e) => setBatchSize(Math.min(500, Math.max(10, parseInt(e.target.value) || 100)))}
            className="w-20 px-2 py-1 text-sm border border-border rounded-lg bg-background"
            min={10}
            max={500}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Concurrency:</label>
          <input
            type="number"
            value={concurrency}
            onChange={(e) => setConcurrency(Math.min(20, Math.max(1, parseInt(e.target.value) || 10)))}
            className="w-16 px-2 py-1 text-sm border border-border rounded-lg bg-background"
            min={1}
            max={20}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        {!autoRun ? (
          <>
            <button
              onClick={runMigrationBatch}
              disabled={migrating || !stats?.pending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <Play className="w-4 h-4" />
              Run Batch
            </button>
            <button
              onClick={startAutoRun}
              disabled={migrating || !stats?.pending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Auto-Run All
            </button>
          </>
        ) : (
          <button
            onClick={stopAutoRun}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium"
          >
            <AlertTriangle className="w-4 h-4" />
            Stop Migration
          </button>
        )}

        {stats && stats.failed > 0 && (
          <>
            <button
              onClick={runRecovery}
              disabled={recovering}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 disabled:opacity-50 transition-colors font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${recovering ? 'animate-spin' : ''}`} />
              Recover Failed
            </button>
            <button
              onClick={() => setShowFailures(!showFailures)}
              className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-xl hover:bg-muted/80 transition-colors font-medium"
            >
              <AlertTriangle className="w-4 h-4" />
              View Failures ({stats.failed})
            </button>
          </>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-xl mb-6 ${
          message.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-700' :
          message.startsWith('✗') ? 'bg-red-500/10 text-red-700' :
          'bg-blue-500/10 text-blue-700'
        }`}>
          <p className="text-sm font-medium">{message}</p>
        </div>
      )}

      {/* Failures List */}
      {showFailures && failures.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
            <h3 className="font-medium">Failed Thumbnails</h3>
            <button
              onClick={deleteUnrecoverable}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Unrecoverable
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {failures.map((f) => (
              <div key={f.vodId} className="px-4 py-3 border-t border-border flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate">{f.vodId}</p>
                  <p className="text-xs text-muted-foreground truncate">{f.error}</p>
                </div>
                {f.recoveryAttempted ? (
                  <span className="text-xs px-2 py-1 bg-red-500/10 text-red-600 rounded">Unrecoverable</span>
                ) : (
                  <span className="text-xs px-2 py-1 bg-orange-500/10 text-orange-600 rounded">Pending Recovery</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completion Message */}
      {stats?.pending === 0 && stats?.migrated > 0 && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 rounded-xl">
          <CheckCircle className="w-6 h-6 text-emerald-600" />
          <div>
            <p className="font-medium text-emerald-700">Migration Complete!</p>
            <p className="text-sm text-emerald-600">
              All {stats.migrated.toLocaleString()} thumbnails have been migrated locally.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
