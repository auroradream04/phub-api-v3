/**
 * Scraper Utilities - Helper functions for robust scraping
 * Handles: validation, parsing, crash recovery
 */

import { prisma } from './prisma'

// ============================================================================
// 1. NUMERIC PARSING WITH VALIDATION
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
// 2. CATEGORY STRING MANAGEMENT WITH SAFE TRUNCATION
// ============================================================================

export function mergeCategories(
  existing: string | null | undefined,
  newCategory: string,
  maxLength: number = 450,
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

  // Build result and check length - remove categories from END if too long
  let result = categories.join(',')

  while (result.length > maxLength && categories.length > 1) {
    categories.pop() // Remove last category
    result = categories.join(',')
  }

  if (result.length > maxLength) {
    console.warn(
      `[Scraper] Single category exceeds max length: ${result.substring(0, 50)}...`
    )
  }

  return result
}

// ============================================================================
// 3. EXPONENTIAL BACKOFF HELPER
// ============================================================================

export function getExponentialBackoff(attempt: number, baseMs: number = 100): number {
  return baseMs * Math.pow(5, attempt - 1)
}

// ============================================================================
// 4. SCRAPER STATE TRACKING (For crash recovery)
// ============================================================================

export interface ScraperCheckpoint {
  id: string
  startedAt: string // Store as ISO string, NOT Date
  updatedAt: string // Store as ISO string, NOT Date
  status: 'running' | 'paused' | 'completed' | 'failed'

  // Current position in scraping
  // We use index (not ID) because categories are only added at the end, never inserted in the middle
  lastCategoryIndex: number // 0-based index of last completed category (-1 if none completed)
  lastPageCompleted: number // Last completed page of that category (0 if just moved to next category)

  // Progress tracking for UI
  currentCategoryName?: string // Name of category currently being scraped
  currentPage?: number // Current page being scraped (1-based)
  pagesPerCategory?: number // Total pages to scrape per category

  // Stats only
  totalVideosScraped: number
  totalVideosFailed: number
  totalCategories?: number // Total categories being scraped (may be filtered)
  videoCountAtStart?: number // Total videos in DB when scrape started
  videoCountCurrent?: number // Current total videos in DB
}

export async function createScraperCheckpoint(): Promise<string> {
  const checkpointId = `scrape_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

  const now = new Date().toISOString()

  await prisma.siteSetting.upsert({
    where: { key: `checkpoint_${checkpointId}` },
    update: {},
    create: {
      key: `checkpoint_${checkpointId}`,
      value: JSON.stringify({
        id: checkpointId,
        startedAt: now,
        updatedAt: now,
        status: 'running',
        lastCategoryIndex: -1,  // No categories started yet
        lastPageCompleted: 0,
        totalVideosScraped: 0,
        totalVideosFailed: 0,
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

  let current: ScraperCheckpoint
  try {
    current = JSON.parse(existing.value) as ScraperCheckpoint
  } catch {
    console.error(`[Scraper] Corrupted checkpoint JSON for ${checkpointId}`)
    return
  }

  const updated: ScraperCheckpoint = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  }

  await prisma.siteSetting.update({
    where: { key: `checkpoint_${checkpointId}` },
    data: { value: JSON.stringify(updated) },
  })
}

export async function getScraperCheckpoint(
  checkpointId: string
): Promise<ScraperCheckpoint | null> {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: `checkpoint_${checkpointId}` },
  })

  if (!setting) return null

  try {
    return JSON.parse(setting.value) as ScraperCheckpoint
  } catch {
    console.error(`[Scraper] Corrupted checkpoint JSON for ${checkpointId}`)
    return null
  }
}

export async function getLatestScraperCheckpoint(): Promise<ScraperCheckpoint | null> {
  const settings = await prisma.siteSetting.findMany({
    where: { key: { startsWith: 'checkpoint_' } },
    orderBy: { updatedAt: 'desc' },
    take: 1,
  })

  if (!settings.length) return null

  try {
    return JSON.parse(settings[0]!.value) as ScraperCheckpoint
  } catch {
    console.error(`[Scraper] Corrupted checkpoint JSON`)
    return null
  }
}
