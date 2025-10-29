/**
 * Scraper Utilities - Helper functions for robust scraping
 * Handles: validation, parsing, pooling, crash recovery
 */

import { PrismaClient } from '../generated/prisma'

const prisma = new PrismaClient()

// ============================================================================
// 1. NUMERIC PARSING WITH VALIDATION (Fix #1: Silent NaN failures)
// ============================================================================

export function parseViews(viewsStr: string): number {
  if (!viewsStr || typeof viewsStr !== 'string') return 0

  try {
    // Handle "2.6K" format
    if (viewsStr.includes('K')) {
      const num = parseFloat(viewsStr.replace('K', '').trim())
      if (isNaN(num)) {
        console.warn(`[Scraper] Invalid views format: "${viewsStr}"`)
        return 0
      }
      return Math.floor(num * 1000)
    }

    // Handle "2.6M" format
    if (viewsStr.includes('M')) {
      const num = parseFloat(viewsStr.replace('M', '').trim())
      if (isNaN(num)) {
        console.warn(`[Scraper] Invalid views format: "${viewsStr}"`)
        return 0
      }
      return Math.floor(num * 1000000)
    }

    // Handle "2,600" format
    const cleanStr = viewsStr.replace(/,/g, '').trim()
    const num = parseInt(cleanStr, 10)
    if (isNaN(num)) {
      console.warn(`[Scraper] Invalid views format: "${viewsStr}"`)
      return 0
    }

    return num
  } catch (error) {
    console.warn(`[Scraper] Error parsing views "${viewsStr}":`, error)
    return 0
  }
}

export function parseDuration(duration: string): number {
  if (!duration || typeof duration !== 'string') return 0

  try {
    const parts = duration.trim().split(':').map((p) => parseInt(p, 10))

    // Validate all parts are valid numbers
    if (parts.some(isNaN)) {
      console.warn(`[Scraper] Invalid duration format: "${duration}"`)
      return 0
    }

    if (parts.length === 2) {
      return parts[0]! * 60 + parts[1]! // MM:SS
    }
    if (parts.length === 3) {
      return parts[0]! * 3600 + parts[1]! * 60 + parts[2]! // HH:MM:SS
    }

    console.warn(`[Scraper] Unexpected duration format: "${duration}"`)
    return 0
  } catch (error) {
    console.warn(`[Scraper] Error parsing duration "${duration}":`, error)
    return 0
  }
}

// ============================================================================
// 2. CATEGORY STRING MANAGEMENT (Fix #2: Unbounded concatenation)
// ============================================================================

export function mergeCategories(
  existing: string | null | undefined,
  newCategory: string,
  maxLength: number = 450, // Leave buffer for database (500 char limit)
  maxCategories: number = 20
): string {
  const categories: string[] = []

  // Parse existing categories
  if (existing) {
    const parts = existing
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
    categories.push(...parts)
  }

  // Add new category if not already present
  if (!categories.includes(newCategory)) {
    categories.push(newCategory)
  }

  // Cap at max categories
  if (categories.length > maxCategories) {
    console.warn(
      `[Scraper] Video has ${categories.length} categories, capping at ${maxCategories}`
    )
    categories.splice(maxCategories)
  }

  // Build result and check length
  const result = categories.join(',')

  if (result.length > maxLength) {
    console.warn(
      `[Scraper] Category string exceeds ${maxLength} chars (${result.length}), truncating`
    )
    return result.substring(0, maxLength)
  }

  return result
}

// ============================================================================
// 3. DATABASE TRANSACTION HELPER (Fix #3: Race condition in category merge)
// ============================================================================

export async function updateVideoWithCategoryMerge(
  vodId: string,
  typeId: number,
  typeName: string,
  newCategoryName: string,
  updateData: Record<string, any>
) {
  return await prisma.$transaction(async (tx) => {
    // Atomically read and update
    const existing = await tx.video.findUnique({
      where: { vodId },
      select: { vodClass: true, typeName: true },
    })

    const vodClass = existing
      ? mergeCategories(existing.vodClass, newCategoryName)
      : newCategoryName

    return await tx.video.upsert({
      where: { vodId },
      update: {
        ...updateData,
        typeId,
        typeName,
        vodClass,
      },
      create: {
        vodId,
        typeId,
        typeName,
        vodClass: newCategoryName,
        ...updateData,
      },
    })
  })
}

// ============================================================================
// 4. CIRCUIT BREAKER PATTERN (Fix #4: Better failure handling)
// ============================================================================

export class CircuitBreaker {
  private failureCount = 0
  private lastFailureTime = 0
  private readonly maxFailures: number
  private readonly resetTimeout: number
  private state: 'closed' | 'open' | 'half-open' = 'closed'

  constructor(maxFailures: number = 3, resetTimeout: number = 60000) {
    this.maxFailures = maxFailures
    this.resetTimeout = resetTimeout
  }

  canAttempt(): boolean {
    if (this.state === 'closed') return true

    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime
      if (timeSinceLastFailure > this.resetTimeout) {
        this.state = 'half-open'
        this.failureCount = 0
        return true
      }
      return false
    }

    return this.state === 'half-open'
  }

  recordSuccess() {
    this.failureCount = 0
    this.state = 'closed'
  }

  recordFailure() {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.maxFailures) {
      this.state = 'open'
      console.warn(
        `[CircuitBreaker] Opened after ${this.failureCount} failures`
      )
    }
  }

  getState() {
    return this.state
  }
}

// ============================================================================
// 5. PROXY SCORING (Fix #5: Proxy health tracking)
// ============================================================================

export class ProxyScorer {
  private scores = new Map<
    string,
    { successes: number; failures: number; lastUsed: number }
  >()

  recordSuccess(proxyUrl: string) {
    const current = this.scores.get(proxyUrl) || { successes: 0, failures: 0, lastUsed: 0 }
    current.successes++
    current.lastUsed = Date.now()
    this.scores.set(proxyUrl, current)
  }

  recordFailure(proxyUrl: string) {
    const current = this.scores.get(proxyUrl) || { successes: 0, failures: 0, lastUsed: 0 }
    current.failures++
    current.lastUsed = Date.now()
    this.scores.set(proxyUrl, current)
  }

  getScore(proxyUrl: string): number {
    const current = this.scores.get(proxyUrl)
    if (!current) return 0.5 // Unknown proxies get neutral score

    const total = current.successes + current.failures
    if (total === 0) return 0.5

    // Success rate (0-1)
    const successRate = current.successes / total

    // Recently failed proxies get lower score
    const timeSinceLastUse = Date.now() - current.lastUsed
    const recencyPenalty = Math.min(1, timeSinceLastUse / 60000) // 1 minute full recovery

    return successRate * recencyPenalty
  }

  shouldBlacklist(proxyUrl: string): boolean {
    const current = this.scores.get(proxyUrl)
    if (!current) return false

    // Blacklist if >90% failure rate and at least 10 attempts
    const total = current.successes + current.failures
    return current.failures / total > 0.9 && total > 10
  }

  getStats() {
    const stats: Record<string, any> = {}
    for (const [url, data] of this.scores.entries()) {
      const total = data.successes + data.failures
      stats[url] = {
        successes: data.successes,
        failures: data.failures,
        successRate: ((data.successes / total) * 100).toFixed(1) + '%',
        score: this.getScore(url).toFixed(2),
        blacklisted: this.shouldBlacklist(url),
      }
    }
    return stats
  }
}

// ============================================================================
// 6. SCRAPER STATE TRACKING (For crash recovery)
// ============================================================================

export interface ScraperCheckpoint {
  id: string
  startedAt: Date
  updatedAt: Date
  status: 'running' | 'paused' | 'completed' | 'failed'
  categories: Array<{
    categoryId: number
    categoryName: string
    pagesTotal: number
    pagesCompleted: number
    videosScraped: number
    videosFailed: number
  }>
  totalVideosScraped: number
  totalVideosFailed: number
  errors: string[]
}

export async function createScraperCheckpoint(): Promise<string> {
  // Create a unique checkpoint ID
  const checkpointId = `scrape_${Date.now()}_${Math.random().toString(36).slice(2)}`

  // Store initial checkpoint in database as a site setting
  await prisma.siteSetting.upsert({
    where: { key: `checkpoint_${checkpointId}` },
    update: {
      value: JSON.stringify({
        id: checkpointId,
        startedAt: new Date(),
        updatedAt: new Date(),
        status: 'running',
        categories: [],
        totalVideosScraped: 0,
        totalVideosFailed: 0,
        errors: [],
      } as ScraperCheckpoint),
    },
    create: {
      key: `checkpoint_${checkpointId}`,
      value: JSON.stringify({
        id: checkpointId,
        startedAt: new Date(),
        updatedAt: new Date(),
        status: 'running',
        categories: [],
        totalVideosScraped: 0,
        totalVideosFailed: 0,
        errors: [],
      } as ScraperCheckpoint),
    },
  })

  return checkpointId
}

export async function updateScraperCheckpoint(
  checkpointId: string,
  updates: Partial<ScraperCheckpoint>
) {
  const existing = await prisma.siteSetting.findUnique({
    where: { key: `checkpoint_${checkpointId}` },
  })

  if (!existing) return

  const current = JSON.parse(existing.value) as ScraperCheckpoint
  const updated = { ...current, ...updates, updatedAt: new Date() }

  await prisma.siteSetting.update({
    where: { key: `checkpoint_${checkpointId}` },
    data: { value: JSON.stringify(updated) },
  })
}

export async function getScraperCheckpoint(checkpointId: string): Promise<ScraperCheckpoint | null> {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: `checkpoint_${checkpointId}` },
  })

  return setting ? (JSON.parse(setting.value) as ScraperCheckpoint) : null
}

export async function getLatestScraperCheckpoint(): Promise<ScraperCheckpoint | null> {
  const settings = await prisma.siteSetting.findMany({
    where: { key: { startsWith: 'checkpoint_' } },
    orderBy: { updatedAt: 'desc' },
    take: 1,
  })

  if (!settings.length) return null
  return JSON.parse(settings[0]!.value) as ScraperCheckpoint
}

// ============================================================================
// 7. EXPONENTIAL BACKOFF HELPER
// ============================================================================

export function getExponentialBackoff(attempt: number, baseMs: number = 100): number {
  // Exponential: 100ms, 500ms, 2500ms, 12500ms
  return baseMs * Math.pow(5, attempt - 1)
}

export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (attempt < maxAttempts) {
        const delayMs = getExponentialBackoff(attempt)
        console.warn(
          `[Retry] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms`
        )
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError
}
