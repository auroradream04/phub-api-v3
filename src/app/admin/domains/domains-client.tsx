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
  ipSessionHash?: string // For Direct/Unknown tracking
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

  // Fetch domains
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

  // Fetch request logs grouped by domain
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

  // Fetch detailed logs for a specific domain
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
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
          Domain Access Control
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Monitor API usage and manage domain access
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'logs'
                ? 'border-zinc-950 text-zinc-950 dark:border-white dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            }`}
          >
            Request Logs
          </button>
          <button
            onClick={() => setActiveTab('domains')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'domains'
                ? 'border-zinc-950 text-zinc-950 dark:border-white dark:text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            }`}
          >
            Blocked Domains
          </button>
        </nav>
      </div>

      {/* Request Logs Tab */}
      {activeTab === 'logs' && !selectedDomainForDetail && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-zinc-600">
              See which domains are accessing your API. Click on a domain to see detailed logs.
            </p>
            <button
              onClick={() => fetchLogs()}
              className="px-3 py-1 text-sm bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white rounded hover:bg-zinc-300 dark:hover:bg-zinc-600"
            >
              🔄 Refresh
            </button>
          </div>

          <div className="bg-white dark:bg-zinc-800 shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
              <thead className="bg-zinc-50 dark:bg-zinc-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Domain
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Total Requests
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Allowed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Blocked
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Last Seen
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-700">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-zinc-500">
                      Loading...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-zinc-500">
                      No requests logged yet
                    </td>
                  </tr>
                ) : (
                  logs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-700 cursor-pointer" onClick={() => log.domain && handleDomainClick(log.domain)}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:underline">
                        {log.domain ? (
                          log.domain
                        ) : (
                          <div className="flex items-center gap-2">
                            <span>Direct/Unknown</span>
                            {log.ipSessionHash && (
                              <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-700 px-2 py-1 rounded"
                                   title={`IP session hash for tracking without referrer`}>
                                #{log.ipSessionHash}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {log.requests.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                        {log.allowed.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                        {log.blocked.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {new Date(log.lastSeen).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {log.domain && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleBlockDomain(log.domain)
                            }}
                            className="text-red-600 hover:text-red-900"
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
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <button
                onClick={handleBackToList}
                className="text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white flex items-center gap-2 mb-2"
              >
                ← Back to all domains
              </button>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                Requests from: {selectedDomainForDetail}
              </h2>
              <p className="text-sm text-zinc-500">
                Showing individual requests from this domain
              </p>
            </div>
            <button
              onClick={() => handleBlockDomain(selectedDomainForDetail)}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Block This Domain
            </button>
          </div>

          <div className="bg-white dark:bg-zinc-800 shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
              <thead className="bg-zinc-50 dark:bg-zinc-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Endpoint
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Response Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Referrer
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-sm text-zinc-500">
                      Loading...
                    </td>
                  </tr>
                ) : detailedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-sm text-zinc-500">
                      No requests found
                    </td>
                  </tr>
                ) : (
                  detailedLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-900 dark:text-white font-mono">
                        <a
                          href={log.endpoint}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          title="Click to open endpoint"
                        >
                          {log.endpoint} ↗
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {log.method}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          log.blocked
                            ? 'bg-red-100 text-red-800'
                            : log.statusCode >= 200 && log.statusCode < 300
                            ? 'bg-green-100 text-green-800'
                            : log.statusCode >= 400
                            ? 'bg-red-100 text-red-800'
                            : 'bg-zinc-100 text-zinc-800'
                        }`}>
                          {log.statusCode}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {log.responseTime}ms
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 font-mono">
                        {log.ipAddress || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {log.hasReferrer ? (
                          <span className="text-green-600 font-semibold">✓ Yes</span>
                        ) : (
                          <span className="text-zinc-400 italic">No</span>
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
        <div>
          <div className="flex gap-4 mb-6">
            <input
              type="text"
              placeholder="Search domains..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 border border-zinc-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-zinc-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="allowed">Allowed</option>
              <option value="blocked">Blocked</option>
            </select>
            <button
              onClick={() => setShowAddDialog(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add Domain
            </button>
          </div>

          <div className="bg-white dark:bg-zinc-800 shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
              <thead className="bg-zinc-50 dark:bg-zinc-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Domain
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-700">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-zinc-500">
                      Loading...
                    </td>
                  </tr>
                ) : domains.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-zinc-500">
                      No blocked domains yet
                    </td>
                  </tr>
                ) : (
                  domains.map((domain) => (
                    <tr key={domain.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-white">
                        {domain.domain}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            domain.status === 'blocked'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {domain.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                        {domain.type}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">
                        {domain.reason || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => openEditDialog(domain)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(domain.id, domain.domain)}
                          className="text-red-600 hover:text-red-900"
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

      {/* Add/Edit Dialogs - Same as before but with matching styling */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-zinc-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">
              Add Domain
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Domain
                </label>
                <input
                  type="text"
                  placeholder="example.com"
                  value={formData.domain}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="allowed">Allowed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="whitelist">Whitelist</option>
                  <option value="blacklist">Blacklist</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Reason
                </label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowAddDialog(false)}
                className="px-4 py-2 border border-zinc-300 rounded-md text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditDialog && (
        <div className="fixed inset-0 bg-zinc-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-800 rounded-lg p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-4">
              Edit Domain
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Domain
                </label>
                <input
                  type="text"
                  value={formData.domain}
                  disabled
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md bg-zinc-100 text-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="allowed">Allowed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="whitelist">Whitelist</option>
                  <option value="blacklist">Blacklist</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Reason
                </label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowEditDialog(false)}
                className="px-4 py-2 border border-zinc-300 rounded-md text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
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
