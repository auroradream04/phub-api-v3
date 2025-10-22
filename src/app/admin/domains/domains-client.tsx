'use client'

import { useEffect, useState } from 'react'

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

export default function DomainsClient() {
  const [domains, setDomains] = useState<Domain[]>([])
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

  const fetchDomains = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (statusFilter !== 'all') params.append('status', statusFilter)

      const response = await fetch(`/api/admin/domains?${params}`)
      const data = await response.json()
      setDomains(data.domains || [])
    } catch (error) {
      console.error('Failed to fetch domains:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDomains()
  }, [search, statusFilter])

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
        const error = await response.json()
        alert(error.error || 'Failed to add domain')
      }
    } catch (error) {
      console.error('Failed to add domain:', error)
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
    } catch (error) {
      console.error('Failed to update domain:', error)
      alert('Failed to update domain')
    }
  }

  const handleDelete = async (id: string, domain: string) => {
    if (!confirm(`Are you sure you want to delete ${domain}?`)) return

    try {
      const response = await fetch(`/api/admin/domains/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchDomains()
      } else {
        alert('Failed to delete domain')
      }
    } catch (error) {
      console.error('Failed to delete domain:', error)
      alert('Failed to delete domain')
    }
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
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Domain Access Control</h1>
        <p className="text-muted-foreground">
          Manage which domains can access your API
        </p>
      </div>

      {/* Filters and Add Button */}
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Search domains..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs border rounded px-3 py-2"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="all">All Status</option>
          <option value="allowed">Allowed</option>
          <option value="blocked">Blocked</option>
        </select>
        <button
          onClick={() => setShowAddDialog(true)}
          className="ml-auto bg-primary text-primary-foreground px-4 py-2 rounded hover:opacity-90"
        >
          Add Domain
        </button>
      </div>

      {/* Domains Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-4 font-medium">Domain</th>
              <th className="text-left p-4 font-medium">Status</th>
              <th className="text-left p-4 font-medium">Type</th>
              <th className="text-left p-4 font-medium">Total Requests</th>
              <th className="text-left p-4 font-medium">Last 7 Days</th>
              <th className="text-left p-4 font-medium">Reason</th>
              <th className="text-right p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-8">
                  Loading...
                </td>
              </tr>
            ) : domains.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground">
                  No domains found. Add one to get started.
                </td>
              </tr>
            ) : (
              domains.map((domain) => (
                <tr key={domain.id} className="border-t">
                  <td className="p-4 font-medium">{domain.domain}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      domain.status === 'blocked'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    }`}>
                      {domain.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded text-xs font-medium border">
                      {domain.type}
                    </span>
                  </td>
                  <td className="p-4">{domain.totalRequests.toLocaleString()}</td>
                  <td className="p-4">{domain.recentRequests.toLocaleString()}</td>
                  <td className="p-4 max-w-xs truncate">{domain.reason || '-'}</td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => openEditDialog(domain)}
                      className="px-3 py-1 text-sm rounded hover:bg-muted"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(domain.id, domain.domain)}
                      className="px-3 py-1 text-sm rounded hover:bg-muted text-red-600"
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

      {/* Add Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Add Domain</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Domain</label>
                <input
                  type="text"
                  placeholder="example.com"
                  value={formData.domain}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="allowed">Allowed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="whitelist">Whitelist</option>
                  <option value="blacklist">Blacklist</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reason (Optional)</label>
                <textarea
                  placeholder="Why is this domain allowed/blocked?"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full border rounded px-3 py-2 min-h-[80px]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddDialog(false)}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90"
              >
                Add Domain
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {showEditDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-6 rounded-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Edit Domain</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Domain</label>
                <input
                  type="text"
                  value={formData.domain}
                  disabled
                  className="w-full border rounded px-3 py-2 bg-muted"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="allowed">Allowed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="whitelist">Whitelist</option>
                  <option value="blacklist">Blacklist</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reason (Optional)</label>
                <textarea
                  placeholder="Why is this domain allowed/blocked?"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="w-full border rounded px-3 py-2 min-h-[80px]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowEditDialog(false)}
                className="px-4 py-2 border rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90"
              >
                Update Domain
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
