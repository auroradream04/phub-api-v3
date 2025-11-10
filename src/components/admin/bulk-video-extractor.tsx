'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Plus, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'

interface ExtractedVideo {
  inputLink: string
  viewkey: string
  title: string
  preview: string
  previewVideo?: string
  videoId: string
  error?: string
}

interface BulkExtractorProps {
  onSelectVideo: (video: ExtractedVideo) => void
}

export function BulkVideoExtractor({ onSelectVideo }: BulkExtractorProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [videoLinks, setVideoLinks] = useState('')
  const [loading, setLoading] = useState(false)
  const [extractedVideos, setExtractedVideos] = useState<ExtractedVideo[]>([])
  const [error, setError] = useState('')
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'results' | 'urls'>('results')

  async function handleExtractVideos() {
    setError('')
    setExtractedVideos([])
    setLoading(true)

    try {
      const links = videoLinks
        .split('\n')
        .map((link) => link.trim())
        .filter((link) => link.length > 0)

      if (links.length === 0) {
        setError('Please enter at least one video link')
        setLoading(false)
        return
      }

      console.log('Sending links to API:', links)

      const response = await fetch('/api/admin/embeds/bulk-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links }),
      })

      console.log('Response status:', response.status)
      const data = await response.json()
      console.log('Response data:', data)

      if (!response.ok) {
        setError(data.error || 'Failed to extract videos')
        setLoading(false)
        return
      }

      setExtractedVideos(data.videos)
    } catch (err) {
      console.error('Error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setVideoLinks('')
    setExtractedVideos([])
    setError('')
  }

  function handleAddVideo(video: ExtractedVideo) {
    if (!video.error) {
      onSelectVideo(video)
      setIsExpanded(false)
      handleClear()
    }
  }

  function handleCopyUrl(url: string) {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  function handleCopyAllUrls() {
    const urls = extractedVideos
      .filter(v => v.previewVideo && !v.error)
      .map(v => v.previewVideo)
      .join('\n')
    navigator.clipboard.writeText(urls)
    setCopiedUrl('all')
    setTimeout(() => setCopiedUrl(null), 2000)
  }

  function handleDownloadUrls() {
    const urls = extractedVideos
      .filter(v => v.previewVideo && !v.error)
      .map(v => v.previewVideo)
      .join('\n')
    const element = document.createElement('a')
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(urls))
    element.setAttribute('download', 'preview-urls.txt')
    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  return (
    <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header with Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-5 border-b border-border/30 bg-gradient-to-r from-card to-card/50 flex items-center justify-between hover:bg-card/80 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 text-left">
          <div className="p-2 rounded-lg bg-primary/10">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">Bulk Video Extractor</h3>
            <p className="text-sm text-muted-foreground">Paste multiple PornHub links to extract videos at once</p>
          </div>
        </div>
        {isExpanded ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-6 space-y-4">
          {/* Input Section */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-foreground">
              Paste PornHub Video Links
              <span className="text-muted-foreground text-xs ml-2">(one per line)</span>
            </label>
            <textarea
              value={videoLinks}
              onChange={(e) => setVideoLinks(e.target.value)}
              placeholder="https://www.pornhub.com/view_video.php?viewkey=68dce6de7fb39&#10;https://www.pornhub.com/view_video.php?viewkey=1234567890ab&#10;https://www.pornhub.com/view_video.php?viewkey=abcdefghijkl"
              className="w-full px-4 py-3 border border-border/50 bg-input text-foreground rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all placeholder:text-muted-foreground/50 font-mono text-sm min-h-[120px] resize-none"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleExtractVideos}
              disabled={loading || videoLinks.trim().length === 0}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-lg hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full"></div>
                  Extracting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Extract Videos
                </>
              )}
            </button>
            <button
              onClick={handleClear}
              disabled={loading || (videoLinks.trim().length === 0 && extractedVideos.length === 0)}
              className="px-4 py-2.5 rounded-lg border border-border/50 bg-card text-sm font-semibold text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Clear
            </button>
          </div>

          {/* Results Section */}
          {extractedVideos.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border/30">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground">
                  Extracted Videos {extractedVideos.filter(v => !v.error).length}/{extractedVideos.length}
                </h4>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 border-b border-border/30">
                <button
                  onClick={() => setActiveTab('results')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'results'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Grid View
                </button>
                <button
                  onClick={() => setActiveTab('urls')}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === 'urls'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Preview URLs ({extractedVideos.filter(v => v.previewVideo && !v.error).length})
                </button>
              </div>

              {/* Grid View Tab */}
              {activeTab === 'results' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                {extractedVideos.map((video, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-border/50 bg-muted/20 flex flex-col justify-between gap-2 hover:border-primary/50 transition-all"
                  >
                    {video.error ? (
                      <div className="space-y-2">
                        <div className="aspect-video bg-black rounded flex items-center justify-center">
                          <svg
                            className="w-8 h-8 text-destructive"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </div>
                        <p className="text-xs text-destructive font-medium truncate">{video.error}</p>
                        <p className="text-xs text-muted-foreground truncate">{video.inputLink}</p>
                      </div>
                    ) : (
                      <>
                        <div className="relative w-full aspect-video bg-black rounded overflow-hidden group">
                          {video.previewVideo ? (
                            <video
                              src={video.previewVideo}
                              className="w-full h-full object-cover"
                              onMouseEnter={(e) => {
                                const vid = e.currentTarget as HTMLVideoElement
                                vid.play().catch(() => {})
                              }}
                              onMouseLeave={(e) => {
                                const vid = e.currentTarget as HTMLVideoElement
                                vid.pause()
                                vid.currentTime = 0
                              }}
                              muted
                            />
                          ) : (
                            <Image
                              src={video.preview}
                              alt={video.title}
                              fill
                              className="object-cover group-hover:scale-110 transition-transform"
                            />
                          )}
                        </div>
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs font-medium text-foreground line-clamp-2">{video.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Viewkey: {video.viewkey.slice(0, 8)}...
                            </p>
                          </div>
                          {video.previewVideo && (
                            <div className="flex items-center gap-1 bg-muted/50 rounded px-2 py-1.5 group/url">
                              <a
                                href={video.previewVideo}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline truncate flex-1"
                              >
                                {video.previewVideo.split('/').pop()?.slice(0, 20)}...
                              </a>
                              <button
                                onClick={() => handleCopyUrl(video.previewVideo!)}
                                className="p-1 rounded hover:bg-primary/20 transition-colors opacity-0 group-url/url-hover:opacity-100"
                                title="Copy URL"
                              >
                                {copiedUrl === video.previewVideo ? (
                                  <Check size={12} className="text-green-500" />
                                ) : (
                                  <Copy size={12} className="text-muted-foreground" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleAddVideo(video)}
                          className="w-full px-3 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-1"
                        >
                          <Plus size={14} />
                          Add as Embed
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              )}

              {/* URLs Tab */}
              {activeTab === 'urls' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyAllUrls}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                        copiedUrl === 'all'
                          ? 'bg-green-500/20 text-green-500'
                          : 'bg-primary/20 hover:bg-primary/30 text-primary'
                      }`}
                    >
                      {copiedUrl === 'all' ? '✓ Copied All URLs' : 'Copy All URLs'}
                    </button>
                    <button
                      onClick={handleDownloadUrls}
                      className="flex-1 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted text-foreground text-xs font-semibold transition-all"
                    >
                      Download as .txt
                    </button>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4 font-mono text-xs max-h-96 overflow-y-auto text-muted-foreground space-y-1">
                    {extractedVideos
                      .filter(v => v.previewVideo && !v.error)
                      .map((video, idx) => (
                        <div key={idx} className="hover:text-foreground transition-colors">
                          {video.previewVideo}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
