'use client'

import { useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'

// Browser icons as SVG components
const BrowserIcons: Record<string, React.ReactNode> = {
  chrome: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" fill="#4285F4"/>
      <circle cx="12" cy="12" r="4" fill="white"/>
      <path d="M12 6 L21.5 18 L2.5 18 Z" fill="#34A853" clipPath="url(#chrome-clip)"/>
      <path d="M6 12 L12 22 L18 12 Z" fill="#FBBC05" clipPath="url(#chrome-clip2)"/>
      <path d="M12 6 L2.5 18 L12 12 Z" fill="#EA4335" clipPath="url(#chrome-clip3)"/>
      <circle cx="12" cy="12" r="4" fill="white"/>
      <circle cx="12" cy="12" r="3" fill="#4285F4"/>
    </svg>
  ),
  safari: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" fill="url(#safari-gradient)"/>
      <defs>
        <linearGradient id="safari-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5AC8FA"/>
          <stop offset="100%" stopColor="#007AFF"/>
        </linearGradient>
      </defs>
      <path d="M12 4 L13 11 L12 12 L11 11 Z" fill="white"/>
      <path d="M12 20 L11 13 L12 12 L13 13 Z" fill="white" opacity="0.7"/>
      <polygon points="12,6 15,12 12,18 9,12" fill="none" stroke="white" strokeWidth="0.5"/>
      <polygon points="7,9 12,12 7,15" fill="#EA4335"/>
      <polygon points="17,9 12,12 17,15" fill="white"/>
    </svg>
  ),
  firefox: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" fill="#FF9500"/>
      <path d="M12 2 C6.48 2 2 6.48 2 12 C2 17.52 6.48 22 12 22 C17.52 22 22 17.52 22 12" fill="#FF6611"/>
      <circle cx="12" cy="12" r="6" fill="#FFDD44"/>
    </svg>
  ),
  edge: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" fill="url(#edge-gradient)"/>
      <defs>
        <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0078D4"/>
          <stop offset="100%" stopColor="#00BCF2"/>
        </linearGradient>
      </defs>
      <path d="M8 16 Q12 20 18 14 Q16 18 10 18 Q6 18 8 16" fill="#50E6FF"/>
    </svg>
  ),
  opera: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" fill="#FF1B2D"/>
      <ellipse cx="12" cy="12" rx="4" ry="7" fill="white"/>
    </svg>
  ),
  brave: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <path d="M12 2 L20 6 L20 14 L12 22 L4 14 L4 6 Z" fill="#FB542B"/>
      <path d="M12 6 L16 8 L16 14 L12 18 L8 14 L8 8 Z" fill="white"/>
    </svg>
  ),
  samsung: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" fill="#1428A0"/>
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">S</text>
    </svg>
  ),
  uc: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" fill="#FF6600"/>
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">UC</text>
    </svg>
  ),
  yandex: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" fill="#FF0000"/>
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">Y</text>
    </svg>
  ),
  quark: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" fill="#6366F1"/>
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">Q</text>
    </svg>
  ),
  huawei: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <circle cx="12" cy="12" r="10" fill="#CF0A2C"/>
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">HW</text>
    </svg>
  ),
}

// Device icons
const DeviceIcons: Record<string, React.ReactNode> = {
  desktop: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  ),
  mobile: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="2" width="14" height="20" rx="2"/>
      <path d="M12 18h.01"/>
    </svg>
  ),
  tablet: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2" width="16" height="20" rx="2"/>
      <path d="M12 18h.01"/>
    </svg>
  ),
}

// OS icons
const OSIcons: Record<string, React.ReactNode> = {
  windows: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <path fill="#00ADEF" d="M0 3.5l9.9-1.4v9.5H0V3.5zm11 -1.5L24 0v11.5H11V2zm-11 10h9.9v9.5L0 20V12zm11 0h13v12l-13-1.8V12z"/>
    </svg>
  ),
  macos: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <path fill="#A2AAAD" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83"/>
    </svg>
  ),
  ios: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <path fill="#A2AAAD" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83"/>
    </svg>
  ),
  android: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <path fill="#3DDC84" d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z"/>
    </svg>
  ),
  linux: (
    <svg viewBox="0 0 24 24" className="w-4 h-4">
      <path fill="#FCC624" d="M12.5 2c-1.5 0-2.5 1-2.5 3v4c0 1-.5 2-1.5 2.5-.5.3-1 .5-1.5 1V18c0 2 1.5 4 4 4h2c2.5 0 4-2 4-4v-5.5c-.5-.5-1-.7-1.5-1-1-.5-1.5-1.5-1.5-2.5V5c0-2-1-3-2.5-3z"/>
    </svg>
  ),
}

function getBrowserIcon(browser: string): React.ReactNode {
  const name = browser.toLowerCase()
  if (name.includes('chrome')) return BrowserIcons.chrome
  if (name.includes('safari')) return BrowserIcons.safari
  if (name.includes('firefox')) return BrowserIcons.firefox
  if (name.includes('edge')) return BrowserIcons.edge
  if (name.includes('opera')) return BrowserIcons.opera
  if (name.includes('brave')) return BrowserIcons.brave
  if (name.includes('samsung')) return BrowserIcons.samsung
  if (name.includes('uc')) return BrowserIcons.uc
  if (name.includes('yandex')) return BrowserIcons.yandex
  if (name.includes('quark')) return BrowserIcons.quark
  if (name.includes('huawei')) return BrowserIcons.huawei
  // Default browser icon
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
    </svg>
  )
}

function getDeviceIcon(device: string): React.ReactNode {
  const name = device.toLowerCase()
  if (name.includes('desktop') || name.includes('computer')) return DeviceIcons.desktop
  if (name.includes('mobile') || name.includes('phone')) return DeviceIcons.mobile
  if (name.includes('tablet')) return DeviceIcons.tablet
  return DeviceIcons.desktop
}

function getOSIcon(os: string): React.ReactNode {
  const name = os.toLowerCase()
  if (name.includes('windows')) return OSIcons.windows
  if (name.includes('mac') || name.includes('osx')) return OSIcons.macos
  if (name.includes('ios') || name.includes('iphone') || name.includes('ipad')) return OSIcons.ios
  if (name.includes('android')) return OSIcons.android
  if (name.includes('linux') || name.includes('ubuntu')) return OSIcons.linux
  // Default OS icon
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  )
}

export type StatsType = 'sources' | 'videos' | 'browsers' | 'devices' | 'os' | 'countries'

interface StatsItem {
  name: string
  count: number
  percentage?: string
}

interface StatsDetailModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  type: StatsType
  data: StatsItem[]
  totalCount?: number
}

export function StatsDetailModal({
  isOpen,
  onClose,
  title,
  type,
  data,
  totalCount,
}: StatsDetailModalProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredData = useMemo(() => {
    if (!searchQuery) return data
    return data.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [data, searchQuery])

  const total = totalCount ?? data.reduce((sum, item) => sum + item.count, 0)

  const getIcon = (name: string): React.ReactNode => {
    switch (type) {
      case 'browsers':
        return getBrowserIcon(name)
      case 'devices':
        return getDeviceIcon(name)
      case 'os':
        return getOSIcon(name)
      default:
        return null
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-[#18181b] border border-[#27272a] rounded-lg w-full max-w-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
          <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-[#27272a]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Press / to search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#1f1f23] border border-[#27272a] rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            />
          </div>
        </div>

        {/* Table Header */}
        <div className="px-4 py-2 border-b border-[#27272a] bg-[#1f1f23]">
          <div className="flex items-center text-xs font-medium text-zinc-400">
            <div className="flex-1">{title.replace(/s$/, '')}</div>
            <div className="w-20 text-right">Visitors</div>
            <div className="w-16 text-right">%</div>
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto">
          {filteredData.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              {searchQuery ? 'No results found' : 'No data available'}
            </div>
          ) : (
            <div className="divide-y divide-[#27272a]">
              {filteredData.map((item, i) => {
                const percentage = item.percentage || (total > 0 ? ((item.count / total) * 100).toFixed(1) : '0')
                const barWidth = total > 0 ? (item.count / total) * 100 : 0
                const icon = getIcon(item.name)

                return (
                  <div key={i} className="relative px-4 py-2.5 hover:bg-[#1f1f23] transition-colors">
                    {/* Background bar */}
                    <div
                      className="absolute inset-y-0 left-0 bg-purple-500/10"
                      style={{ width: `${barWidth}%` }}
                    />
                    {/* Content */}
                    <div className="relative flex items-center">
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        {icon && <span className="flex-shrink-0 text-zinc-400">{icon}</span>}
                        <span className="text-sm text-zinc-100 truncate">
                          {item.name || 'Unknown'}
                        </span>
                      </div>
                      <div className="w-20 text-right text-sm text-zinc-300 font-medium">
                        {item.count.toLocaleString()}
                      </div>
                      <div className="w-16 text-right text-sm text-zinc-500">
                        {percentage}%
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#27272a] text-center text-xs text-zinc-500">
          {filteredData.length} {filteredData.length === 1 ? 'item' : 'items'}
          {searchQuery && ` matching "${searchQuery}"`}
        </div>
      </div>
    </div>
  )
}

// Export icon getters for use in the main page
export { getBrowserIcon, getDeviceIcon, getOSIcon }
