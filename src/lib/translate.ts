import { prisma } from '@/lib/prisma'

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
 * Translate using MyMemory API (free, no rate limits)
 * MyMemory is completely free with no rate limiting or API keys needed
 * Supports auto-detection of source language
 */
async function translateWithMyMemory(text: string): Promise<string> {
  const url = new URL('https://api.mymemory.translated.net/get')
  url.searchParams.set('q', text)
  url.searchParams.set('langpair', 'en|zh-CN')  // English to Chinese (handles most cases)

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Translation Bot/1.0)'
    }
  })

  if (!response.ok) {
    throw new Error(`MyMemory API error: ${response.status}`)
  }

  const data = await response.json() as {
    responseStatus: number
    responseDetails?: string
    responseData?: {
      translatedText?: string
    }
  }

  if (data.responseStatus !== 200) {
    throw new Error(`MyMemory error: ${data.responseDetails || 'Unknown error'}`)
  }

  const translatedText = data.responseData?.translatedText
  if (!translatedText) {
    throw new Error('No translation returned from MyMemory')
  }

  return translatedText
}

/**
 * Translate multiple texts in a single batch API request using newline separator
 * MyMemory supports batching by sending newline-separated text
 */
async function translateBatchWithMyMemory(texts: string[]): Promise<string[]> {
  if (texts.length === 0) {
    return []
  }

  // Join all texts with newlines for batch translation
  const bundledText = texts.join('\n')

  const url = new URL('https://api.mymemory.translated.net/get')
  url.searchParams.set('q', bundledText)
  url.searchParams.set('langpair', 'en|zh-CN')  // English to Chinese (MyMemory doesn't support auto-detection)

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Translation Bot/1.0)'
    }
  })

  if (!response.ok) {
    throw new Error(`MyMemory API error: ${response.status}`)
  }

  const data = await response.json() as {
    responseStatus: number
    responseDetails?: string
    responseData?: {
      translatedText?: string
    }
  }

  if (data.responseStatus !== 200) {
    throw new Error(`MyMemory error: ${data.responseDetails || 'Unknown error'}`)
  }

  const translatedText = data.responseData?.translatedText
  if (!translatedText) {
    throw new Error('No translation returned from MyMemory')
  }

  // Split the result back into individual translations
  const translations = translatedText.split('\n')

  // Handle case where returned lines don't match expected count
  if (translations.length !== texts.length) {
    console.warn(`[Translation Batch] Line count mismatch: expected ${texts.length}, got ${translations.length}`)
  }

  return translations
}

/**
 * Translation result with success status
 */
export interface TranslationResult {
  text: string
  success: boolean
  wasCached: boolean
  isChinese?: boolean // Whether result is actually Chinese
}

/**
 * Translate text to Chinese (Simplified) using MyMemory API
 * Uses in-memory cache and retry logic
 * Each translation attempt has a 10-second timeout
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

  // Retry up to 3 times
  const MAX_RETRIES = 3
  const TIMEOUT_MS = 10000 // 10 second timeout per attempt
  let retries = MAX_RETRIES

  while (retries > 0) {
    try {
      // Translate using MyMemory API with timeout
      const translated = await withTimeout(
        translateWithMyMemory(text),
        TIMEOUT_MS,
        'Translation timeout'
      )

      // Validate result is Chinese
      if (!isChinese(translated)) {
        console.warn(`[Translation] Non-Chinese result: "${text.substring(0, 50)}" → "${translated.substring(0, 50)}"`)
        // Still cache it but mark as non-Chinese
        translationCache.set(cacheKey, translated)
        return { text: translated, success: false, wasCached: false, isChinese: false }
      }

      // Cache and return success
      translationCache.set(cacheKey, translated)
      console.log(`[Translation] ✓ "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" → "${translated.substring(0, 50)}${translated.length > 50 ? '...' : ''}"`)
      return { text: translated, success: true, wasCached: false, isChinese: true }

    } catch (error) {
      retries--
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (retries > 0) {
        const delay = 500 + Math.random() * 500
        console.warn(`[Translation] Error: ${errorMessage}, retrying (${MAX_RETRIES - retries}/${MAX_RETRIES})...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      // All retries exhausted
      console.error(`[Translation] Failed after ${MAX_RETRIES} retries:`, errorMessage)
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
 * Translate multiple texts efficiently in batches
 * Sends up to 100 titles at once separated by newlines (much faster!)
 * Returns array of translations in same order as input
 * No rate limiting issues with MyMemory
 */
export async function translateBatchEfficient(titles: string[], delayMs = 300): Promise<TranslationResult[]> {
  if (titles.length === 0) {
    return []
  }

  console.log(`[Translation] Starting batch translation of ${titles.length} titles...`)

  const results: TranslationResult[] = Array(titles.length).fill(null)
  const batchSize = 100
  let batchCount = 0

  // Process in batches of 100
  for (let i = 0; i < titles.length; i += batchSize) {
    const batchStart = i
    const batchEnd = Math.min(i + batchSize, titles.length)
    const batch = titles.slice(batchStart, batchEnd)
    batchCount++

    console.log(`[Translation] Processing batch ${batchCount}: titles ${batchStart + 1}-${batchEnd}/${titles.length}...`)

    // Check cache first and separate what needs translation
    const batchResults: (TranslationResult | null)[] = []
    const indicesToTranslate: number[] = []
    const titlesToTranslate: string[] = []

    for (let j = 0; j < batch.length; j++) {
      const title = batch[j]
      const cacheKey = `zh-cn:${title}`

      if (isChinese(title)) {
        batchResults[j] = { text: title, success: true, wasCached: false, isChinese: true }
      } else if (translationCache.has(cacheKey)) {
        batchResults[j] = { text: translationCache.get(cacheKey)!, success: true, wasCached: true, isChinese: true }
      } else {
        batchResults[j] = null
        indicesToTranslate.push(j)
        titlesToTranslate.push(title)
      }
    }

    // If nothing needs translation, skip API call
    if (titlesToTranslate.length === 0) {
      for (let j = 0; j < batch.length; j++) {
        results[batchStart + j] = batchResults[j]!
      }
      continue
    }

    // Translate all uncached titles at once
    let retries = 3
    let translated = false
    let translatedTexts: string[] = []

    while (retries > 0 && !translated) {
      try {
        translatedTexts = await withTimeout(
          translateBatchWithMyMemory(titlesToTranslate),
          15000,
          'Batch translation timeout'
        )

        translated = true
        console.log(`[Translation] ✓ Batch ${batchCount} succeeded: ${titlesToTranslate.length} titles translated`)

      } catch (error) {
        retries--
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (retries > 0) {
          const delay = 1000 + Math.random() * 2000
          console.warn(`[Translation] Batch ${batchCount} failed: ${errorMessage}, retrying (${3 - retries}/3)...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        } else {
          console.warn(`[Translation] ✗ Batch ${batchCount} failed after 3 retries: ${errorMessage}`)
        }
      }
    }

    // Process results
    for (let j = 0; j < batch.length; j++) {
      if (batchResults[j] !== null) {
        // Already cached or Chinese
        results[batchStart + j] = batchResults[j]!
      } else {
        // Just translated
        const translationIndex = indicesToTranslate.indexOf(j)
        if (translated && translationIndex < translatedTexts.length) {
          const translatedText = translatedTexts[translationIndex].trim()
          const translatedIsChinese = isChinese(translatedText)
          const originalTitle = batch[j]

          // Cache the result
          const cacheKey = `zh-cn:${originalTitle}`
          translationCache.set(cacheKey, translatedText)

          results[batchStart + j] = {
            text: translatedText,
            success: translatedIsChinese,
            wasCached: false,
            isChinese: translatedIsChinese
          }

          console.log(`[Translation] ✓ [${batchStart + j + 1}/${titles.length}] "${originalTitle.substring(0, 40)}${originalTitle.length > 40 ? '...' : ''}" → "${translatedText.substring(0, 40)}${translatedText.length > 40 ? '...' : ''}"`)
        } else {
          // Translation failed
          results[batchStart + j] = {
            text: batch[j],
            success: false,
            wasCached: false,
            isChinese: false
          }

          console.warn(`[Translation] ✗ [${batchStart + j + 1}/${titles.length}] Failed: "${batch[j].substring(0, 40)}"`)
        }
      }
    }

    // Delay between batches
    if (batchEnd < titles.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs + Math.random() * 200))
    }
  }

  const successCount = results.filter(r => r.success).length
  const chineseCount = results.filter(r => r.isChinese).length
  console.log(`[Translation] ✓ Complete: ${successCount}/${titles.length} successful, ${chineseCount}/${titles.length} in Chinese`)
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
