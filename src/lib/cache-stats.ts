/**
 * In-memory cache statistics tracking
 * Tracks cache operations (get/set/clear) for visibility into cache behavior
 * Data is reset on server restart (acceptable for 2-hour TTL cache)
 */

interface CacheEntry {
  key: string
  size: number
  createdAt: Date
  lastAccessed: Date
  hitCount: number
  type: 'video' | 'search' | 'category' | 'home' | 'other'
}

const cacheMemory = new Map<string, CacheEntry>()

let stats = {
  totalSets: 0,
  totalGets: 0,
  totalClears: 0,
  totalHits: 0,
  totalMisses: 0,
  startTime: Date.now()
}

/**
 * Estimate size of data (rough approximation)
 */
function estimateSize(data: unknown): number {
  try {
    return JSON.stringify(data).length
  } catch {
    return 0
  }
}

/**
 * Categorize cache key to track by type
 */
function categorizeKey(key: string): CacheEntry['type'] {
  if (key.startsWith('video-')) return 'video'
  if (key === 'home') return 'home'
  if (key.startsWith('search-')) return 'search'
  if (key === 'categories') return 'category'
  return 'other'
}

/**
 * Track a cache set operation
 */
export function trackCacheSet(key: string, data: unknown): void {
  const size = estimateSize(data)
  const type = categorizeKey(key)

  cacheMemory.set(key, {
    key,
    size,
    createdAt: new Date(),
    lastAccessed: new Date(),
    hitCount: 0,
    type
  })

  stats.totalSets++
}

/**
 * Track a cache get operation (hit or miss)
 */
export function trackCacheGet(key: string, hit: boolean): void {
  if (hit) {
    const entry = cacheMemory.get(key)
    if (entry) {
      entry.hitCount++
      entry.lastAccessed = new Date()
    }
    stats.totalHits++
  } else {
    stats.totalMisses++
  }
  stats.totalGets++
}

/**
 * Track cache clear operations
 */
export function trackCacheClear(target: string): void {
  if (target === 'all') {
    cacheMemory.clear()
  } else if (target.startsWith('video-')) {
    cacheMemory.delete(target)
  }
  stats.totalClears++
}

/**
 * Get current cache statistics
 */
export function getCacheStats() {
  const entries = Array.from(cacheMemory.values())

  const totalSize = entries.reduce((sum, e) => sum + e.size, 0)
  const uptime = Date.now() - stats.startTime

  // Group by type
  const byType = entries.reduce(
    (acc, entry) => {
      const key = entry.type
      if (!acc[key]) {
        acc[key] = { count: 0, size: 0, hits: 0 }
      }
      acc[key].count++
      acc[key].size += entry.size
      acc[key].hits += entry.hitCount
      return acc
    },
    {} as Record<string, { count: number; size: number; hits: number }>
  )

  const hitRate = stats.totalGets > 0 ? (stats.totalHits / stats.totalGets) * 100 : 0

  return {
    totalEntries: cacheMemory.size,
    totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
    uptime,
    uptimeMinutes: Math.round(uptime / 60000),
    hitRate: hitRate.toFixed(2),
    stats: {
      totalSets: stats.totalSets,
      totalGets: stats.totalGets,
      totalClears: stats.totalClears,
      totalHits: stats.totalHits,
      totalMisses: stats.totalMisses
    },
    byType,
    entries: entries
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 20) // Top 20 entries
      .map((e) => ({
        key: e.key,
        size: e.size,
        sizeMB: (e.size / 1024 / 1024).toFixed(4),
        type: e.type,
        hitCount: e.hitCount,
        createdAt: e.createdAt,
        lastAccessed: e.lastAccessed,
        ageMs: Date.now() - e.createdAt.getTime(),
        ageMinutes: Math.round((Date.now() - e.createdAt.getTime()) / 60000)
      }))
  }
}

/**
 * Reset stats (useful for testing)
 */
export function resetCacheStats(): void {
  cacheMemory.clear()
  stats = {
    totalSets: 0,
    totalGets: 0,
    totalClears: 0,
    totalHits: 0,
    totalMisses: 0,
    startTime: Date.now()
  }
}
