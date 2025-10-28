import { translate } from '@vitalets/google-translate-api'
import { PrismaClient } from '@/generated/prisma'
import { getRandomProxy } from './proxy'

const prisma = new PrismaClient()

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
 * Translate text to Chinese (Simplified)
 * Uses in-memory cache and rotating proxies with retry logic to avoid rate limits
 */
export async function translateToZhCN(text: string): Promise<string> {
  // If already Chinese, return as-is
  if (isChinese(text)) {
    return text
  }

  // Check cache first
  const cacheKey = `zh-cn:${text}`
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!
  }

  // Retry up to 3 times with different proxies
  const MAX_RETRIES = 3
  let retries = MAX_RETRIES

  while (retries > 0) {
    try {
      // Get a random proxy for this request
      const proxyInfo = getRandomProxy('Translation')

      if (!proxyInfo) {
        console.warn('[Translation] No proxy available, translating without proxy')
        const result = await translate(text, { to: 'zh-CN' })
        const translated = result.text
        translationCache.set(cacheKey, translated)
        return translated
      }

      // Translate with proxy
      const result = await translate(text, {
        to: 'zh-CN',
        fetchOptions: {
          agent: proxyInfo.agent
        }
      })
      const translated = result.text

      // Cache the result
      translationCache.set(cacheKey, translated)

      console.log(`[Translation] (${proxyInfo.proxyUrl}) "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" → "${translated.substring(0, 50)}${translated.length > 50 ? '...' : ''}"`)
      return translated

    } catch (error) {
      retries--

      // Check if it's a rate limit error
      const isRateLimit = (error as { status?: number; statusCode?: number })?.status === 429 || (error as { status?: number; statusCode?: number })?.statusCode === 429

      if (isRateLimit && retries > 0) {
        console.warn(`[Translation] Rate limit hit, retrying with different proxy (${MAX_RETRIES - retries}/${MAX_RETRIES})...`)
        // Small delay before retry
        await new Promise(resolve => setTimeout(resolve, 300))
        continue
      }

      // If no retries left or different error, return original
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (retries === 0) {
        console.error(`[Translation] Failed after ${MAX_RETRIES} retries:`, errorMessage)
      } else {
        console.error('[Translation] Failed to translate:', errorMessage)
      }

      return text
    }
  }

  // Fallback (should never reach here)
  return text
}

/**
 * Translate multiple texts in parallel using proxy rotation
 * Each request uses a different proxy to avoid rate limiting
 */
export async function translateBatch(texts: string[]): Promise<string[]> {
  console.log(`[Translation] Starting parallel translation of ${texts.length} texts with proxy rotation...`)

  try {
    // Translate ALL texts in parallel - each gets a different proxy!
    const results = await Promise.all(
      texts.map(text => translateToZhCN(text))
    )

    const translatedCount = results.filter((r, i) => r !== texts[i]).length
    console.log(`[Translation] ✓ Batch complete: ${translatedCount}/${texts.length} translated (${texts.length - translatedCount} already Chinese or cached)`)

    return results
  } catch (error) {
    console.error(`[Translation] Batch failed:`, error)
    // Return originals if entire batch fails
    return texts
  }
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
