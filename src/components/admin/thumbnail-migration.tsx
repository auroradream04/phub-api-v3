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
  const [showDeleteModal, setShowDeleteModal] = useState<'failed' | 'pending' | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
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

  const handleDelete = async (type: 'failed' | 'pending') => {
    if (deleteConfirmText !== 'I UNDERSTAND') return

    setMessage('Deleting...')
    setShowDeleteModal(null)
    setDeleteConfirmText('')

    try {
      const res = await fetch('/api/admin/recover-thumbnails', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          deleteFromDb: true,
          deleteType: type, // 'failed' or 'pending'
        }),
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
    <div className="p-5 bg-[#18181b]/50 rounded-lg border border-[#27272a]">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-medium text-zinc-200">Thumbnail Migration</span>
        <button onClick={fetchStats} disabled={loading} className="text-zinc-500 hover:text-purple-400 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-8 text-sm mb-5">
        <div>
          <span className="text-zinc-500">Total</span>
          <span className="ml-2 text-zinc-100 font-medium">{stats?.total.toLocaleString() || '-'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Migrated</span>
          <span className="ml-2 text-purple-400 font-medium">{stats?.migrated.toLocaleString() || '-'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Pending</span>
          <span className="ml-2 text-zinc-100 font-medium">{stats?.pending.toLocaleString() || '-'}</span>
        </div>
        <div>
          <span className="text-zinc-500">Failed</span>
          <span className="ml-2 text-red-400 font-medium">{stats?.failed || '-'}</span>
        </div>
      </div>

      {/* Progress bar */}
      {stats && stats.total > 0 && (
        <div className="mb-5">
          <div className="flex justify-between text-sm text-zinc-500 mb-2">
            <span className="text-purple-400 font-medium">{stats.percentComplete.toFixed(1)}%</span>
            <span>{disk?.totalSizeMB.toFixed(1)} MB / ~{estimatedTotalGB} GB</span>
          </div>
          <div className="h-2 bg-[#1f1f23] rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-600 transition-all"
              style={{ width: `${stats.percentComplete}%` }}
            />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-5 mb-5">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Batch</span>
          <input
            type="number"
            value={batchSize}
            onChange={(e) => setBatchSize(Math.min(500, Math.max(10, parseInt(e.target.value) || 100)))}
            className="w-20 px-3 py-1.5 bg-[#1f1f23] border border-[#27272a] rounded-lg text-zinc-100 focus:outline-none focus:border-purple-500"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Concurrency</span>
          <input
            type="number"
            value={concurrency}
            onChange={(e) => setConcurrency(Math.min(20, Math.max(1, parseInt(e.target.value) || 10)))}
            className="w-16 px-3 py-1.5 bg-[#1f1f23] border border-[#27272a] rounded-lg text-zinc-100 focus:outline-none focus:border-purple-500"
          />
        </div>
        {message && <span className="text-sm text-zinc-400">{message}</span>}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {!autoRun ? (
          <>
            <button
              onClick={runMigrationBatch}
              disabled={migrating || !stats?.pending}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:hover:bg-purple-600 rounded-lg text-sm font-medium transition-colors"
            >
              <Play className="w-4 h-4" />
              Run Batch
            </button>
            <button
              onClick={startAutoRun}
              disabled={migrating || !stats?.pending}
              className="flex items-center gap-2 px-4 py-2 bg-[#1f1f23] hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Auto-Run
            </button>
          </>
        ) : (
          <button
            onClick={stopAutoRun}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        )}

        {stats && stats.failed > 0 && (
          <>
            <button
              onClick={runRecovery}
              disabled={recovering}
              className="px-4 py-2 bg-[#1f1f23] hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-sm transition-colors"
            >
              {recovering ? 'Recovering...' : 'Recover Failed'}
            </button>
            <button
              onClick={() => setShowFailures(!showFailures)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1f1f23] hover:bg-zinc-700 rounded-lg text-sm transition-colors"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showFailures ? 'rotate-180' : ''}`} />
              Failures ({stats.failed})
            </button>
          </>
        )}
      </div>

      {/* Delete buttons */}
      <div className="flex gap-3 flex-wrap mt-5">
        {stats && stats.failed > 0 && (
          <button
            onClick={() => setShowDeleteModal('failed')}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
          >
            Delete Failed ({stats.failed})
          </button>
        )}
        {stats && stats.pending > 0 && (
          <button
            onClick={() => setShowDeleteModal('pending')}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-sm font-medium transition-colors"
          >
            Delete Pending ({stats.pending.toLocaleString()})
          </button>
        )}
      </div>

      {/* Failures list */}
      {showFailures && failures.length > 0 && (
        <div className="mt-5 border-t border-[#27272a] pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-zinc-500">Failed thumbnails</span>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-2 text-sm">
            {failures.slice(0, 20).map((f) => (
              <div key={f.vodId} className="flex items-center justify-between py-1.5 text-zinc-400">
                <span className="font-mono">{f.vodId}</span>
                <span className={f.recoveryAttempted ? 'text-red-400' : 'text-zinc-500'}>
                  {f.recoveryAttempted ? 'unrecoverable' : 'pending'}
                </span>
              </div>
            ))}
            {failures.length > 20 && (
              <div className="text-zinc-600 pt-1">+{failures.length - 20} more</div>
            )}
          </div>
        </div>
      )}

      {/* Completion */}
      {stats?.pending === 0 && stats?.migrated > 0 && (
        <div className="mt-5 text-sm text-purple-400 font-medium">
          Migration complete - {stats.migrated.toLocaleString()} thumbnails
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">
              Delete {showDeleteModal === 'failed' ? 'Failed' : 'Pending'} Thumbnails
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              This will delete{' '}
              {showDeleteModal === 'failed'
                ? `${stats?.failed} videos with unrecoverable thumbnails`
                : `${stats?.pending.toLocaleString()} pending migration videos`}
              {' '}from the database. This action cannot be undone.
            </p>
            <p className="text-sm text-red-400 font-medium mb-4">
              Type "I UNDERSTAND" to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="I UNDERSTAND"
              className="w-full px-3 py-2 bg-[#1f1f23] border border-[#27272a] rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-red-500 focus:outline-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(null)
                  setDeleteConfirmText('')
                }}
                className="flex-1 px-4 py-2 bg-[#1f1f23] hover:bg-zinc-700 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteModal)}
                disabled={deleteConfirmText !== 'I UNDERSTAND'}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
              >
                Delete {showDeleteModal === 'failed' ? stats?.failed : stats?.pending.toLocaleString()} videos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
