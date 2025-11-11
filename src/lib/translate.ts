import { prisma } from '@/lib/prisma'

// LibreTranslate API configuration
const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || 'https://translate.alvinchang.dev'
const LIBRETRANSLATE_API_KEY = process.env.LIBRETRANSLATE_API_KEY || ''

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
 * Translate using LibreTranslate API
 * LibreTranslate is open-source, self-hosted, no rate limiting, no character limits
 * Supports auto-detection of source language
 */
async function translateWithLibreTranslate(text: string): Promise<string> {
  const formData = new URLSearchParams()
  formData.append('q', text)
  formData.append('source', 'auto')  // Auto-detect source language
  formData.append('target', 'zh')    // Chinese (simplified)
  if (LIBRETRANSLATE_API_KEY) {
    formData.append('api_key', LIBRETRANSLATE_API_KEY)
  }

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Translation Bot/1.0)'
    },
    body: formData
  }

  console.log(`[LibreTranslate] Sending single title: "${text.substring(0, 50)}"`)
  const startTime = Date.now()
  const response = await fetch(`${LIBRETRANSLATE_URL}/translate`, fetchOptions)
  const elapsed = Date.now() - startTime
  console.log(`[LibreTranslate] Response received after ${elapsed}ms`)

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`LibreTranslate API error ${response.status}: ${errorText.substring(0, 200)}`)
  }

  const data = await response.json() as {
    translatedText?: string
    error?: string
  }

  if (data.error) {
    throw new Error(`LibreTranslate error: ${data.error}`)
  }

  const translatedText = data.translatedText
  if (!translatedText) {
    throw new Error('No translation returned from LibreTranslate')
  }

  return translatedText
}

/**
 * Translate multiple texts in a single batch API request using LibreTranslate
 * LibreTranslate supports batching by sending newline-separated text
 */
async function translateBatchWithLibreTranslate(texts: string[]): Promise<string[]> {
  if (texts.length === 0) {
    return []
  }

  const formData = new URLSearchParams()

  // LibreTranslate API supports newline-separated batch translation
  // Send all texts joined by newlines, then split the result
  const bundledText = texts.join('\n')
  formData.append('q', bundledText)
  formData.append('source', 'auto')  // Auto-detect source language
  formData.append('target', 'zh')    // Chinese (simplified)
  if (LIBRETRANSLATE_API_KEY) {
    formData.append('api_key', LIBRETRANSLATE_API_KEY)
  }

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Translation Bot/1.0)'
    },
    body: formData
  }

  try {
    console.log(`[LibreTranslate] Sending ${texts.length} titles to ${LIBRETRANSLATE_URL}/translate`)
    const startTime = Date.now()
    const response = await fetch(`${LIBRETRANSLATE_URL}/translate`, fetchOptions)
    const elapsed = Date.now() - startTime
    console.log(`[LibreTranslate] Response received after ${elapsed}ms`)

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`LibreTranslate API error ${response.status}: ${errorText.substring(0, 300)}`)
    }

    const data = await response.json() as {
      translatedText?: string
      error?: string
    }

    if (data.error) {
      throw new Error(`LibreTranslate error: ${data.error}`)
    }

    const translatedText = data.translatedText
    if (!translatedText) {
      throw new Error('No translation returned from LibreTranslate')
    }

    // Split the result back into individual translations (newline-separated)
    const translations = translatedText.split('\n')

    // Handle case where returned lines don't match expected count
    if (translations.length !== texts.length) {
      console.warn(`[Translation Batch] Line count mismatch: expected ${texts.length}, got ${translations.length}`)
    }

    return translations
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[Translation Batch] Request failed: ${errorMsg}`)
    throw error
  }
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
      // Translate using LibreTranslate API with timeout
      const translated = await withTimeout(
        translateWithLibreTranslate(text),
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
 * Sends up to 100 titles at once (no character limit on self-hosted LibreTranslate!)
 * Returns array of translations in same order as input
 * LibreTranslate charLimit: -1 = unlimited, so we can batch aggressively
 */
export async function translateBatchEfficient(titles: string[], delayMs = 300): Promise<TranslationResult[]> {
  if (titles.length === 0) {
    return []
  }

  console.log(`[Translation] Starting batch translation of ${titles.length} titles...`)

  const results: TranslationResult[] = Array(titles.length).fill(null)
  const batchSize = 50  // Reduced from 100: 50 titles ~ 10-12 seconds (100 was ~22 seconds, too risky with timeout)
  let batchCount = 0

  // Process in batches of 50
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
        console.log(`[Translation] Skipping already Chinese: "${title.substring(0, 40)}${title.length > 40 ? '...' : ''}"`)
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
      console.log(`[Translation] Batch ${batchCount}: All titles already cached or Chinese, skipping API call`)
      for (let j = 0; j < batch.length; j++) {
        results[batchStart + j] = batchResults[j]!
      }
      continue
    }

    console.log(`[Translation] Batch ${batchCount}: Need to translate ${titlesToTranslate.length}/${batch.length} titles`)
    const totalChars = titlesToTranslate.join('\n').length
    console.log(`[Translation] Batch ${batchCount}: Total characters: ${totalChars}`)

    // Translate all uncached titles at once
    let retries = 3
    let translated = false
    let translatedTexts: string[] = []

    while (retries > 0 && !translated) {
      try {
        translatedTexts = await withTimeout(
          translateBatchWithLibreTranslate(titlesToTranslate),
          60000,  // 60 seconds: LibreTranslate is slow (~22s for 100 titles, so ~11s for 50)
          'Batch translation timeout'
        )

        translated = true
        console.log(`[Translation] ✓ Batch ${batchCount} succeeded: ${titlesToTranslate.length} titles translated`)

      } catch (error) {
        retries--
        const errorMessage = error instanceof Error ? error.message : String(error)
        const is429 = errorMessage.includes('429')

        if (retries > 0) {
          // Use exponential backoff: 429 errors get longer waits
          const baseDelay = is429 ? 3000 : 1000
          const exponentialMultiplier = Math.pow(2, 3 - retries) // 1x, 2x, 4x
          const delay = baseDelay * exponentialMultiplier + Math.random() * 1000
          console.warn(`[Translation] Batch ${batchCount} failed${is429 ? ' (Rate limited 429)' : ''}: ${errorMessage}, retrying in ${Math.round(delay)}ms (${3 - retries}/3)...`)
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
          console.log(`[Translation] Result for "${batch[j].substring(0, 30)}...": "${translatedText.substring(0, 30)}..." (isChinese: ${translatedIsChinese})`)
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
