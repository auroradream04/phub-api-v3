'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// Types
interface AdUser {
  email: string
  name: string | null
}

interface AdSegment {
  quality: number
  filesize: number
  filepath: string
}

interface Ad {
  id: string
  title: string
  description: string | null
  duration: number
  status: string
  weight: number
  forceDisplay: boolean
  createdAt: string
  updatedAt: string
  userId: string
  user: AdUser
  segments: AdSegment[]
  _count: {
    impressions: number
  }
}

interface UploadFormData {
  title: string
  description: string
  status: 'active' | 'inactive'
  weight: number
  forceDisplay: boolean
  file: File | null
  duration: number
}

export default function AdsManagement() {
  const [ads, setAds] = useState<Ad[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const [formData, setFormData] = useState<UploadFormData>({
    title: '',
    description: '',
    status: 'active',
    weight: 1,
    forceDisplay: false,
    file: null,
    duration: 3
  })

  // Fetch ads on mount
  const fetchAds = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/admin/ads')
      if (!response.ok) {
        throw new Error('Failed to fetch ads')
      }
      const data = await response.json()
      setAds(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ads')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAds()
  }, [fetchAds])

  // Handle file drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type.startsWith('video/')) {
        setFormData(prev => ({ ...prev, file }))
        setUploadError(null)
      } else {
        setUploadError('Please upload a video file')
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.type.startsWith('video/')) {
        setFormData(prev => ({ ...prev, file }))
        setUploadError(null)
      } else {
        setUploadError('Please upload a video file')
      }
    }
  }

  // Handle ad upload
  const handleUpload = async () => {
    if (!formData.file || !formData.title) {
      setUploadError('Please provide a video file and title')
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setUploadError(null)
    setUploadSuccess(false)

    try {
      // Simulate progress (in a real app, you'd use XMLHttpRequest or fetch with streams)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const formDataToSend = new FormData()
      formDataToSend.append('file', formData.file)
      formDataToSend.append('title', formData.title)
      formDataToSend.append('description', formData.description)
      formDataToSend.append('status', formData.status)
      formDataToSend.append('weight', formData.weight.toString())
      formDataToSend.append('forceDisplay', formData.forceDisplay.toString())
      formDataToSend.append('segmentDuration', formData.duration.toString())

      const response = await fetch('/api/admin/ads/upload', {
        method: 'POST',
        body: formDataToSend
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const newAd = await response.json()
      setAds(prev => [newAd, ...prev])
      setUploadSuccess(true)

      // Reset form
      setTimeout(() => {
        setFormData({
          title: '',
          description: '',
          status: 'active',
          weight: 1,
          forceDisplay: false,
          file: null,
          duration: 3
        })
        setUploadProgress(0)
        setUploadSuccess(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }, 2000)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
      setUploadProgress(0)
    } finally {
      setUploading(false)
    }
  }

  // Handle status toggle
  const handleStatusToggle = async (ad: Ad) => {
    try {
      const newStatus = ad.status === 'active' ? 'inactive' : 'active'
      const response = await fetch('/api/admin/ads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ad.id, status: newStatus })
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }

      const updatedAd = await response.json()
      setAds(prev => prev.map(a => a.id === updatedAd.id ? updatedAd : a))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  // Handle ad deletion
  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/ads?id=${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete ad')
      }

      setAds(prev => prev.filter(ad => ad.id !== id))
      setDeleteConfirm(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete ad')
    }
  }


  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="px-4 sm:px-0">
      <h2 className="text-2xl font-bold text-foreground mb-6">
        Ads Management
      </h2>

      {/* Upload Section */}
      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Upload New Ad
        </h3>

        <div className="space-y-4">
          {/* Drag and Drop Area */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer"
            >
              <svg
                className="mx-auto h-12 w-12 text-muted-foreground"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p className="mt-2 text-sm text-foreground">
                <span className="font-semibold">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-muted-foreground">
                MP4, WebM, or Ogg video files
              </p>
            </label>
            {formData.file && (
              <p className="mt-4 text-sm text-primary">
                Selected: {formData.file.name} ({formatFileSize(formData.file.size)})
              </p>
            )}
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                placeholder="Ad title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Segment Duration (seconds)
              </label>
              <select
                value={formData.duration}
                onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
              >
                <option value="3">3 seconds (recommended)</option>
                <option value="5">5 seconds</option>
                <option value="10">10 seconds</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Video will be split into segments of this duration
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Weight (Probability)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.weight}
                onChange={(e) => setFormData(prev => ({ ...prev, weight: parseInt(e.target.value) || 1 }))}
                className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Higher weight = higher chance of appearing (1-100)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Force Display
              </label>
              <div className="flex items-center h-10">
                <input
                  type="checkbox"
                  checked={formData.forceDisplay}
                  onChange={(e) => setFormData(prev => ({ ...prev, forceDisplay: e.target.checked }))}
                  className="h-4 w-4 text-primary focus:ring-primary border-border rounded bg-input"
                />
                <span className="ml-2 text-sm text-muted-foreground">
                  Always show this ad (ignores weight)
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
              placeholder="Ad description (optional)"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <label className="block text-sm font-medium text-foreground mr-4">
                Status
              </label>
              <button
                onClick={() => setFormData(prev => ({
                  ...prev,
                  status: prev.status === 'active' ? 'inactive' : 'active'
                }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.status === 'active'
                    ? 'bg-primary'
                    : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.status === 'active' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="ml-2 text-sm text-muted-foreground">
                {formData.status === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading || !formData.file || !formData.title}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? 'Uploading...' : 'Upload Ad'}
            </button>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {/* Upload Messages */}
          {uploadError && (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-md">
              <p className="text-sm text-destructive">{uploadError}</p>
            </div>
          )}

          {uploadSuccess && (
            <div className="p-4 bg-primary/10 border border-primary/30 rounded-md">
              <p className="text-sm text-primary">Ad uploaded successfully!</p>
            </div>
          )}
        </div>
      </div>

      {/* Ads Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">
            Existing Ads ({ads.length})
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-2 text-muted-foreground">Loading ads...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-destructive">{error}</p>
            <button
              onClick={fetchAds}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : ads.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="mx-auto h-12 w-12 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 4v16M17 4v16M3 8h4m10 0h4M5 12h14M3 16h4m10 0h4"
              />
            </svg>
            <p className="mt-2 text-foreground">No ads found</p>
            <p className="text-sm text-muted-foreground">Upload your first ad to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Weight
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Force
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Views
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {ads.map((ad) => (
                  <tr key={ad.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-foreground truncate max-w-xs">
                        {ad.title}
                      </div>
                      {ad.segments[0] && (
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(ad.segments[0].filesize)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <button
                        onClick={() => handleStatusToggle(ad)}
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full transition-colors ${
                          ad.status === 'active'
                            ? 'bg-primary/20 text-primary'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {ad.status}
                      </button>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-foreground text-center">
                      {ad.weight}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-center">
                      {ad.forceDisplay ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-foreground text-center">
                      {ad.duration}s
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm text-foreground text-center">
                      {ad._count.impressions.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(ad.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => window.location.href = `/admin/ads/detail/${ad.id}`}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          title="View Details"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            alert('Edit functionality would be implemented here')
                          }}
                          className="text-muted-foreground hover:text-accent transition-colors"
                          title="Edit"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {deleteConfirm === ad.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(ad.id)}
                              className="text-destructive hover:text-destructive/80 font-medium text-xs transition-colors"
                              title="Confirm delete"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-muted-foreground hover:text-foreground font-medium text-xs transition-colors"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(ad.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
