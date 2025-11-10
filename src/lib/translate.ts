import { translate } from '@vitalets/google-translate-api'
import { prisma } from '@/lib/prisma'
import { getRandomProxy } from './proxy'

// In-memory cache for translations (cleared on server restart)
const translationCache = new Map<string, string>()

/**
 * Get the translation setting from database
 */
export async function isTranslationEnabled(): Promise<boolean> {
  try {
    const setting = await prisma.siteSetting.findUnique({
      where: { key: 'auto_translate_titles' }
    })
    return setting?.value === 'true'
  } catch (error) {
    console.error('[Translation] Failed to get translation setting:', error)
    return false
  }
}

/**
 * Detect if text is primarily Chinese
 */
export function isChinese(text: string): boolean {
  // Count Chinese characters (CJK Unified Ideographs)
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || []
  const totalChars = text.replace(/\s+/g, '').length

  // If more than 50% of non-space characters are Chinese, consider it Chinese
  return totalChars > 0 && (chineseChars.length / totalChars) > 0.5
}

/**
 * Helper to wrap a promise with timeout
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
  )
  return Promise.race([promise, timeout])
}

/**
 * Translation result with success status
 */
export interface TranslationResult {
  text: string
  success: boolean
  wasCached: boolean
}

/**
 * Translate text to Chinese (Simplified)
 * Uses in-memory cache and rotating proxies with retry logic to avoid rate limits
 * Each translation attempt has a 5-second timeout
 */
export async function translateToZhCN(text: string): Promise<TranslationResult> {
  // If already Chinese, return as-is
  if (isChinese(text)) {
    return { text, success: true, wasCached: false }
  }

  // Check cache first
  const cacheKey = `zh-cn:${text}`
  if (translationCache.has(cacheKey)) {
    return { text: translationCache.get(cacheKey)!, success: true, wasCached: true }
  }

  // Retry up to 3 times with different proxies
  const MAX_RETRIES = 3
  const TIMEOUT_MS = 5000 // 5 second timeout per attempt
  let retries = MAX_RETRIES

  while (retries > 0) {
    try {
      // Get a random proxy for this request
      const proxyInfo = getRandomProxy('Translation')

      if (!proxyInfo) {
        console.warn('[Translation] No proxy available, translating without proxy')
        const result = await withTimeout(
          translate(text, { to: 'zh-CN' }),
          TIMEOUT_MS,
          'Translation timeout'
        )
        const translated = result.text
        translationCache.set(cacheKey, translated)
        return { text: translated, success: true, wasCached: false }
      }

      // Translate with proxy and timeout
      const result = await withTimeout(
        translate(text, {
          to: 'zh-CN',
          fetchOptions: {
            agent: proxyInfo.agent
          }
        }),
        TIMEOUT_MS,
        'Translation timeout'
      )
      const translated = result.text

      // Cache the result
      translationCache.set(cacheKey, translated)

      console.log(`[Translation] (${proxyInfo.proxyUrl}) "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" → "${translated.substring(0, 50)}${translated.length > 50 ? '...' : ''}"`)
      return { text: translated, success: true, wasCached: false }

    } catch (error) {
      retries--

      const errorMessage = error instanceof Error ? error.message : String(error)

      // Check if it's a rate limit error
      const isRateLimit = (error as { status?: number; statusCode?: number })?.status === 429 || (error as { status?: number; statusCode?: number })?.statusCode === 429

      // Check if it's a timeout
      const isTimeout = errorMessage.includes('timeout')

      if ((isRateLimit || isTimeout) && retries > 0) {
        const reason = isTimeout ? 'Timeout' : 'Rate limit hit'
        console.warn(`[Translation] ${reason}, retrying with different proxy (${MAX_RETRIES - retries}/${MAX_RETRIES})...`)
        // Small delay before retry
        await new Promise(resolve => setTimeout(resolve, 300))
        continue
      }

      // If no retries left or different error, return original with failure flag
      if (retries === 0) {
        console.error(`[Translation] Failed after ${MAX_RETRIES} retries:`, errorMessage)
      } else {
        console.error('[Translation] Failed to translate:', errorMessage)
      }

      return { text, success: false, wasCached: false }
    }
  }

  // Fallback (should never reach here)
  return { text, success: false, wasCached: false }
}

/**
 * Translate multiple texts in parallel using proxy rotation
 * Each request uses a different proxy to avoid rate limiting
 */
export async function translateBatch(texts: string[]): Promise<TranslationResult[]> {
  console.log(`[Translation] Starting parallel translation of ${texts.length} texts with proxy rotation...`)

  try {
    // Translate ALL texts in parallel - each gets a different proxy!
    const results = await Promise.all(
      texts.map(text => translateToZhCN(text))
    )

    const successCount = results.filter(r => r.success && !r.wasCached).length
    const failedCount = results.filter(r => !r.success).length
    const cachedCount = results.filter(r => r.wasCached).length

    console.log(`[Translation] ✓ Batch complete: ${successCount}/${texts.length} translated, ${failedCount} failed, ${cachedCount} cached`)

    return results
  } catch (error) {
    console.error(`[Translation] Batch failed:`, error)
    // Return originals with failure flags if entire batch fails
    return texts.map(text => ({ text, success: false, wasCached: false }))
  }
}

/**
 * Translate multiple texts efficiently in a single API request
 * Bundles up to 100 titles separated by newlines and translates them in one request
 * Returns array of translations in same order as input
 * Uses 3 retries with proxy rotation on failure
 */
export async function translateBatchEfficient(titles: string[]): Promise<TranslationResult[]> {
  if (titles.length === 0) {
    return []
  }

  console.log(`[Translation] Starting efficient batch translation of ${titles.length} titles (${Math.ceil(titles.length / 100)} API requests)...`)

  const results: TranslationResult[] = Array(titles.length).fill(null)
  const batchSize = 100
  let requestCount = 0

  // Process in batches of 100
  for (let i = 0; i < titles.length; i += batchSize) {
    const batch = titles.slice(i, i + batchSize)
    const batchStartIndex = i

    // Check cache first for all items in batch
    const batchResults: (TranslationResult | null)[] = batch.map((title) => {
      const cacheKey = `zh-cn:${title}`
      if (isChinese(title)) {
        return { text: title, success: true, wasCached: false }
      }
      if (translationCache.has(cacheKey)) {
        return { text: translationCache.get(cacheKey)!, success: true, wasCached: true }
      }
      return null
    })

    // Check if all items are cached or already Chinese
    if (batchResults.every(r => r !== null)) {
      for (let j = 0; j < batch.length; j++) {
        results[batchStartIndex + j] = batchResults[j]!
      }
      continue
    }

    // Need to translate - join remaining items with newlines
    const titlesThatNeedTranslation = batch.map((title, idx) =>
      batchResults[idx] !== null ? null : title
    )
    const indicesToTranslate = titlesThatNeedTranslation
      .map((title, idx) => title !== null ? idx : -1)
      .filter(idx => idx !== -1)

    if (indicesToTranslate.length === 0) {
      for (let j = 0; j < batch.length; j++) {
        results[batchStartIndex + j] = batchResults[j]!
      }
      continue
    }

    const titlesToTranslate = indicesToTranslate.map(idx => batch[idx])
    const bundledText = titlesToTranslate.join('\n')

    // Retry logic: 3 attempts with proxy rotation
    let translated = false
    let translatedText = ''
    let retries = 3

    while (retries > 0 && !translated) {
      try {
        const proxyInfo = getRandomProxy('TranslationBatch')
        const TIMEOUT_MS = 15000 // Longer timeout for batch requests

        const result = await withTimeout(
          translate(bundledText, {
            to: 'zh-CN',
            fetchOptions: proxyInfo ? { agent: proxyInfo.agent } : undefined
          }),
          TIMEOUT_MS,
          'Translation batch timeout'
        )

        translatedText = result.text
        translated = true
        requestCount++

        console.log(`[Translation Batch] Request #${requestCount} (${proxyInfo?.proxyUrl || 'no proxy'}) succeeded for ${batch.length} titles`)
      } catch (error) {
        retries--
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (retries > 0) {
          console.warn(`[Translation Batch] Request failed, retrying... (${3 - retries}/3)`)
          await new Promise(resolve => setTimeout(resolve, 500))
        } else {
          console.error(`[Translation Batch] Failed after 3 retries for batch of ${batch.length}:`, errorMessage)
        }
      }
    }

    // Split results back into array
    if (translated) {
      const translatedLines = translatedText.split('\n').map(line => line.trim())

      // Handle case where returned lines don't match expected count
      for (let j = 0; j < indicesToTranslate.length; j++) {
        const batchIdx = indicesToTranslate[j]
        const translatedTitle = translatedLines[j] || batch[batchIdx] // Fallback to original if missing

        // Cache and add result
        const cacheKey = `zh-cn:${batch[batchIdx]}`
        translationCache.set(cacheKey, translatedTitle)
        results[batchStartIndex + batchIdx] = {
          text: translatedTitle,
          success: true,
          wasCached: false
        }
      }
    } else {
      // Translation failed - mark as failed but keep titles unchanged
      for (const batchIdx of indicesToTranslate) {
        results[batchStartIndex + batchIdx] = {
          text: batch[batchIdx],
          success: false,
          wasCached: false
        }
      }
    }

    // Add cached/already-chinese results
    for (let j = 0; j < batch.length; j++) {
      if (batchResults[j] !== null) {
        results[batchStartIndex + j] = batchResults[j]!
      }
    }
  }

  console.log(`[Translation Batch] ✓ Complete: ${results.filter(r => r.success).length}/${titles.length} successful in ${requestCount} API requests`)
  return results
}

/**
 * Clear translation cache (useful for memory management)
 */
export function clearTranslationCache() {
  translationCache.clear()
  console.log('[Translation] Cache cleared')
}

/**
 * Get cache statistics
 */
export function getTranslationCacheStats() {
  return {
    size: translationCache.size,
    entries: Array.from(translationCache.entries()).slice(0, 10) // First 10 entries
  }
}
