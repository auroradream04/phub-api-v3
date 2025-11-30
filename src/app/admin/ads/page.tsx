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
  const [activeTab, setActiveTab] = useState<'upload' | 'manage'>('manage')
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
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Ads Management</h1>
        <p className="text-zinc-500 mt-1">Upload and manage video advertisements</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#27272a]">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('manage')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'manage'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            Manage Ads
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'upload'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            }`}
          >
            Upload New
          </button>
        </nav>
      </div>

      {/* Upload Section */}
      {activeTab === 'upload' && (
      <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-medium text-zinc-100">Upload New Ad</h3>
            <p className="text-sm text-zinc-500">Add a new video advertisement to your collection</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Drag and Drop Area */}
          <div
            className={`relative border-2 border-dashed rounded-lg p-10 text-center transition-all ${
              dragActive
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-[#27272a] hover:border-zinc-600 hover:bg-[#1f1f23]'
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
              className="cursor-pointer block"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-purple-500/10 mb-4">
                <svg
                  className="w-7 h-7 text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <p className="text-base font-medium text-zinc-300">
                <span className="text-purple-400">Click to upload</span> or drag and drop
              </p>
              <p className="text-sm text-zinc-500 mt-1">
                MP4, WebM, or Ogg • Maximum 500MB
              </p>
            </label>
            {formData.file && (
              <div className="mt-4 p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                <p className="text-sm font-medium text-purple-400">
                  ✓ Selected: {formData.file.name}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {formatFileSize(formData.file.size)}
                </p>
              </div>
            )}
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
                placeholder="Enter ad title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Segment Duration
              </label>
              <select
                value={formData.duration}
                onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none"
              >
                <option value="3">3 seconds (recommended)</option>
                <option value="5">5 seconds</option>
                <option value="10">10 seconds</option>
              </select>
              <p className="text-xs text-zinc-500 mt-1.5">
                How the video will be split into segments
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Weight (Probability)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.weight}
                onChange={(e) => setFormData(prev => ({ ...prev, weight: parseInt(e.target.value) || 1 }))}
                className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none"
                placeholder="1"
              />
              <p className="text-xs text-zinc-500 mt-1.5">
                1-100: Higher = more likely to display
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-3">
                Force Display
              </label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.forceDisplay}
                  onChange={(e) => setFormData(prev => ({ ...prev, forceDisplay: e.target.checked }))}
                  className="h-4 w-4 text-purple-500 focus:ring-2 focus:ring-purple-500 border-[#27272a] rounded bg-[#1f1f23] cursor-pointer"
                />
                <span className="ml-3 text-sm text-zinc-400">
                  Always show this ad
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1.5">
                Ignores weight settings if enabled
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2.5 border border-[#27272a] bg-[#1f1f23] text-zinc-100 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all placeholder:text-zinc-600 outline-none resize-none"
              placeholder="Add optional description for this ad..."
            />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-[#27272a]">
            <div className="flex items-center gap-3">
              <label className="block text-sm font-medium text-zinc-300">
                Status
              </label>
              <button
                onClick={() => setFormData(prev => ({
                  ...prev,
                  status: prev.status === 'active' ? 'inactive' : 'active'
                }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${
                  formData.status === 'active'
                    ? 'bg-purple-600'
                    : 'bg-[#27272a]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.status === 'active' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-sm font-medium ${
                formData.status === 'active' ? 'text-purple-400' : 'text-zinc-500'
              }`}>
                {formData.status === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading || !formData.file || !formData.title}
              className="w-full sm:w-auto px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8v8m0-8a8 8 0 008 8v-8" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Upload Ad
                </>
              )}
            </button>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">Uploading...</p>
                <span className="text-sm font-medium text-purple-400">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-[#1f1f23] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-purple-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Upload Messages */}
          {uploadError && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-red-400">Upload failed</p>
                <p className="text-sm text-red-400/80 mt-0.5">{uploadError}</p>
              </div>
            </div>
          )}

          {uploadSuccess && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-green-400">Upload successful</p>
                <p className="text-sm text-green-400/80 mt-0.5">Your ad has been uploaded and is ready to use</p>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Ads Table */}
      {activeTab === 'manage' && (
      <div className="bg-[#18181b] border border-[#27272a] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#27272a]">
          <h3 className="text-base font-medium text-zinc-100">Existing Ads</h3>
          <p className="text-sm text-zinc-500 mt-0.5">{ads.length} {ads.length === 1 ? 'ad' : 'ads'} uploaded</p>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent"></div>
            <p className="mt-2 text-zinc-500">Loading ads...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={fetchAds}
              className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : ads.length === 0 ? (
          <div className="p-8 text-center">
            <svg
              className="mx-auto h-10 w-10 text-zinc-600"
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
            <p className="mt-2 text-zinc-300">No ads found</p>
            <p className="text-sm text-zinc-500">Upload your first ad to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-[#1f1f23] border-b border-[#27272a]">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Weight
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Force
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Views
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a]">
                {ads.map((ad) => (
                  <tr key={ad.id} className="hover:bg-[#1f1f23] transition-colors">
                    <td className="px-5 py-4">
                      <div className="text-sm font-medium text-zinc-100 truncate max-w-xs">
                        {ad.title}
                      </div>
                      {ad.segments[0] && (
                        <div className="text-xs text-zinc-500 mt-1">
                          {formatFileSize(ad.segments[0].filesize)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleStatusToggle(ad)}
                        className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                          ad.status === 'active'
                            ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20'
                        }`}
                      >
                        {ad.status}
                      </button>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-zinc-100 text-center">
                      {ad.weight}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-center">
                      {ad.forceDisplay ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/10 text-purple-400">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      ) : (
                        <span className="text-sm text-zinc-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-zinc-100 text-center">
                      {ad.duration}s
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-zinc-100 text-center">
                      {ad._count.impressions.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-xs text-zinc-500">
                      {new Date(ad.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => window.location.href = `/admin/ads/detail/${ad.id}`}
                          className="p-1.5 rounded-lg text-zinc-500 hover:bg-purple-500/10 hover:text-purple-400 transition-colors"
                          title="View Details"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            alert('Edit functionality would be implemented here')
                          }}
                          className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {deleteConfirm === ad.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(ad.id)}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                              title="Confirm delete"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-700 transition-colors"
                              title="Cancel"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(ad.id)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      )}
    </div>
  )
}
