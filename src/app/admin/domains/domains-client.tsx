'use client'

import { useEffect, useState, useCallback } from 'react'

interface Domain {
  id: string
  domain: string
  status: string
  type: string
  reason: string | null
  totalRequests: number
  recentRequests: number
  createdAt: string
}

interface RequestLog {
  domain: string
  requests: number
  blocked: number
  allowed: number
  lastSeen: string
  ipSessionHash?: string
}

interface DetailedLog {
  id: string
  domain: string
  endpoint: string
  method: string
  statusCode: number
  responseTime: number
  blocked: boolean
  timestamp: string
  ipAddress: string | null
  userAgent: string | null
  hasReferrer?: boolean
  ipSessionHash?: string
  clientFingerprint?: string
}

export default function DomainsClient() {
  const [activeTab, setActiveTab] = useState<'domains' | 'logs'>('logs')
  const [domains, setDomains] = useState<Domain[]>([])
  const [logs, setLogs] = useState<RequestLog[]>([])
  const [detailedLogs, setDetailedLogs] = useState<DetailedLog[]>([])
  const [selectedDomainForDetail, setSelectedDomainForDetail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null)

  const [formData, setFormData] = useState({
    domain: '',
    status: 'allowed',
    type: 'whitelist',
    reason: ''
  })

  const fetchDomains = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (statusFilter !== 'all') params.append('status', statusFilter)

      const response = await fetch(`/api/admin/domains?${params}`)
      const data = await response.json()
      setDomains(data.domains || [])
    } catch {

    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/domains/logs')
      const data = await response.json()
      setLogs(data.logs || [])
    } catch {

    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDetailedLogs = async (domain: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/admin/domains/logs/detail?domain=${encodeURIComponent(domain)}`)
      const data = await response.json()
      setDetailedLogs(data.logs || [])
    } catch {

    } finally {
      setLoading(false)
    }
  }

  const handleDomainClick = (domain: string) => {
    setSelectedDomainForDetail(domain)
    fetchDetailedLogs(domain)
  }

  const handleBackToList = () => {
    setSelectedDomainForDetail(null)
    setDetailedLogs([])
  }

  useEffect(() => {
    if (activeTab === 'domains') {
      fetchDomains()
    } else {
      fetchLogs()
    }
  }, [activeTab, search, statusFilter, fetchDomains, fetchLogs])

  const handleAdd = async () => {
    try {
      const response = await fetch('/api/admin/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        setShowAddDialog(false)
        setFormData({ domain: '', status: 'allowed', type: 'whitelist', reason: '' })
        fetchDomains()
      } else {
        const errorData = await response.json()
        alert(errorData.error || 'Failed to add domain')
      }
    } catch {
      alert('Failed to add domain')
    }
  }

  const handleUpdate = async () => {
    if (!selectedDomain) return

    try {
      const response = await fetch(`/api/admin/domains/${selectedDomain.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        setShowEditDialog(false)
        setSelectedDomain(null)
        fetchDomains()
      } else {
        alert('Failed to update domain')
      }
    } catch {
      alert('Failed to update domain')
    }
  }

  const handleDelete = async (id: string, domain: string) => {
    if (!confirm(`Delete ${domain}?`)) return

    try {
      const response = await fetch(`/api/admin/domains/${id}`, { method: 'DELETE' })
      if (response.ok) fetchDomains()
      else alert('Failed to delete domain')
    } catch {
      alert('Failed to delete domain')
    }
  }

  const handleBlockDomain = (domain: string) => {
    setFormData({
      domain,
      status: 'blocked',
      type: 'blacklist',
      reason: 'Blocked from request logs'
    })
    setShowAddDialog(true)
  }

  const openEditDialog = (domain: Domain) => {
    setSelectedDomain(domain)
    setFormData({
      domain: domain.domain,
      status: domain.status,
      type: domain.type,
      reason: domain.reason || ''
    })
    setShowEditDialog(true)
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Domain Access Control</h1>
        <p className="text-zinc-500 mt-1">Monitor API usage and manage domain access</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#27272a]">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'logs'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            Request Logs
          </button>
          <button
            onClick={() => setActiveTab('domains')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'domains'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            Blocked Domains
          </button>
        </nav>
      </div>

      {/* Request Logs Tab */}
      {activeTab === 'logs' && !selectedDomainForDetail && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-500">
              See which domains are accessing your API. Click on a domain to see detailed logs.
            </p>
            <button
              onClick={() => fetchLogs()}
              className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>

          <div className="bg-[#18181b] border border-[#27272a] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#27272a]">
              <h3 className="text-base font-medium text-zinc-100">Recent API Requests</h3>
              <p className="text-sm text-zinc-500 mt-0.5">Domains accessing your API</p>
            </div>

            <table className="min-w-full">
              <thead className="bg-[#1f1f23] border-b border-[#27272a]">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Domain</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Requests</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Allowed</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Blocked</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Last Seen</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-4 text-center text-sm text-zinc-500">
                      Loading...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-4 text-center text-sm text-zinc-500">
                      No requests logged yet
                    </td>
                  </tr>
                ) : (
                  logs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-[#1f1f23] cursor-pointer transition-colors" onClick={() => log.domain && handleDomainClick(log.domain)}>
                      <td className="px-5 py-4 whitespace-nowrap text-sm font-medium text-zinc-100 hover:text-purple-400">
                        {log.domain ? (
                          log.domain
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>Direct/Unknown</span>
                            {log.ipSessionHash && (
                              <span className="text-xs text-zinc-500 bg-[#1f1f23] px-2 py-1 rounded"
                                   title="IP session hash for tracking without referrer">
                                #{log.ipSessionHash}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-zinc-400">
                        {log.requests.toLocaleString()}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-green-400">
                        {log.allowed.toLocaleString()}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-red-400">
                        {log.blocked.toLocaleString()}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {new Date(log.lastSeen).toLocaleString()}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right text-sm">
                        {log.domain && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleBlockDomain(log.domain)
                            }}
                            className="text-red-400 hover:text-red-300 font-medium"
                          >
                            Block
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Domain Detail View */}
      {activeTab === 'logs' && selectedDomainForDetail && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={handleBackToList}
                className="text-zinc-400 hover:text-zinc-200 flex items-center gap-2 mb-2 text-sm"
              >
                ← Back to all domains
              </button>
              <h2 className="text-lg font-medium text-zinc-100">
                Requests from: {selectedDomainForDetail}
              </h2>
              <p className="text-sm text-zinc-500">
                Showing individual requests from this domain
              </p>
            </div>
            <button
              onClick={() => handleBlockDomain(selectedDomainForDetail)}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium text-sm transition-colors"
            >
              Block This Domain
            </button>
          </div>

          <div className="bg-[#18181b] border border-[#27272a] rounded-lg overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-[#1f1f23] border-b border-[#27272a]">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Timestamp</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Endpoint</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Method</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Response Time</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">IP Address</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Referrer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-4 text-center text-sm text-zinc-500">
                      Loading...
                    </td>
                  </tr>
                ) : detailedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-4 text-center text-sm text-zinc-500">
                      No requests found
                    </td>
                  </tr>
                ) : (
                  detailedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#1f1f23] transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-5 py-4 text-sm font-mono text-zinc-100">
                        <a
                          href={log.endpoint}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300"
                          title="Click to open endpoint"
                        >
                          {log.endpoint} ↗
                        </a>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {log.method}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          log.blocked
                            ? 'bg-red-500/10 text-red-400'
                            : log.statusCode >= 200 && log.statusCode < 300
                            ? 'bg-green-500/10 text-green-400'
                            : log.statusCode >= 400
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-zinc-500/10 text-zinc-400'
                        }`}>
                          {log.statusCode}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {log.responseTime}ms
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-zinc-500 font-mono">
                        {log.ipAddress || '-'}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm">
                        {log.hasReferrer ? (
                          <span className="text-green-400 font-medium">✓ Yes</span>
                        ) : (
                          <span className="text-zinc-600 italic">No</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Domains Tab */}
      {activeTab === 'domains' && (
        <div className="space-y-4">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Search domains..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none"
            >
              <option value="all">All Status</option>
              <option value="allowed">Allowed</option>
              <option value="blocked">Blocked</option>
            </select>
            <button
              onClick={() => setShowAddDialog(true)}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
            >
              Add Domain
            </button>
          </div>

          <div className="bg-[#18181b] border border-[#27272a] rounded-lg overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-[#1f1f23] border-b border-[#27272a]">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Domain</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Type</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Reason</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-4 text-center text-sm text-zinc-500">
                      Loading...
                    </td>
                  </tr>
                ) : domains.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-4 text-center text-sm text-zinc-500">
                      No blocked domains yet
                    </td>
                  </tr>
                ) : (
                  domains.map((domain) => (
                    <tr key={domain.id} className="hover:bg-[#1f1f23] transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap text-sm font-medium text-zinc-100">
                        {domain.domain}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            domain.status === 'blocked'
                              ? 'bg-red-500/10 text-red-400'
                              : 'bg-green-500/10 text-green-400'
                          }`}
                        >
                          {domain.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {domain.type}
                      </td>
                      <td className="px-5 py-4 text-sm text-zinc-500">
                        {domain.reason || '-'}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => openEditDialog(domain)}
                          className="text-purple-400 hover:text-purple-300 mr-4 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(domain.id, domain.domain)}
                          className="text-red-400 hover:text-red-300 font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Dialogs */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-zinc-100 mb-4">
              Add Domain
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Domain
                </label>
                <input
                  type="text"
                  placeholder="example.com"
                  value={formData.domain}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none"
                >
                  <option value="allowed">Allowed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none"
                >
                  <option value="whitelist">Whitelist</option>
                  <option value="blacklist">Blacklist</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Reason
                </label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none resize-none"
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowAddDialog(false)}
                className="px-4 py-2 border border-[#27272a] bg-[#18181b] text-zinc-100 rounded-lg hover:bg-[#1f1f23] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-zinc-100 mb-4">
              Edit Domain
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Domain
                </label>
                <input
                  type="text"
                  value={formData.domain}
                  disabled
                  className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-500 rounded-lg cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none"
                >
                  <option value="allowed">Allowed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none"
                >
                  <option value="whitelist">Whitelist</option>
                  <option value="blacklist">Blacklist</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Reason
                </label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none resize-none"
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowEditDialog(false)}
                className="px-4 py-2 border border-[#27272a] bg-[#18181b] text-zinc-100 rounded-lg hover:bg-[#1f1f23] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
