import { NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'

// Custom categories that use search instead of PornHub category IDs
// Use high numeric IDs (9998-9999) to avoid conflicts with PornHub category IDs
// NOTE: Display names are capitalized but search queries must be lowercase (PornHub bug)
const CUSTOM_CATEGORIES = [
  { id: 9999, name: 'Japanese' },
  { id: 9998, name: 'Chinese' }
]

export async function GET() {
  try {
    const pornhub = new PornHub()
    let categories = null

    // ALWAYS use proxy - try up to 3 different proxies
    let retries = 3
    let attemptNum = 1

    while (retries > 0 && !categories) {
      // Select proxy BEFORE making request
      const proxyInfo = getRandomProxy('Categories API')

      if (!proxyInfo) {
        console.warn('[Categories] No proxies available. Cannot make request.')
        break
      }

      console.log(`[Categories] Attempt ${attemptNum}/3 using proxy ${proxyInfo.proxyUrl}`)
      pornhub.setAgent(proxyInfo.agent)

      const startTime = Date.now()
      try {
        // Fetch categories from PornHub using the WebMaster API
        const response = await pornhub.webMaster.getCategories()

        const duration = Date.now() - startTime

        // Check for soft blocking (empty results)
        if (!response || response.length === 0) {
          console.log(`[Categories] ⚠️  Proxy ${proxyInfo.proxyUrl} returned empty results (soft block) after ${duration}ms - trying different proxy...`)
        } else {
          console.log(`[Categories] ✅ Proxy ${proxyInfo.proxyUrl} successful! Got ${response.length} categories in ${duration}ms`)
          categories = response
        }
      } catch (error: unknown) {
        const duration = Date.now() - startTime
        console.error(`[Categories] ❌ Proxy ${proxyInfo.proxyUrl} failed after ${duration}ms:`, error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
      attemptNum++
    }

    if (!categories || categories.length === 0) {
      throw new Error('Failed to fetch categories from PornHub')
    }

    // The API returns objects with 'id' and 'category' fields
    // Convert 'category' field to 'name' for consistency and format properly
    const formattedCategories = categories.map(cat => ({
      id: Number(cat.id), // Ensure ID is a number
      name: cat.category
        .replace(/-/g, ' ') // Replace hyphens with spaces
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize first letter of each word
        .join(' ')
    }))

    // Add custom categories at the beginning
    const allCategories = [...CUSTOM_CATEGORIES, ...formattedCategories]

    return NextResponse.json({
      categories: allCategories,
      total: allCategories.length
    })
  } catch (error) {
    console.error('[API] Error fetching categories from PornHub:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch categories from PornHub'
      },
      { status: 500 }
    )
  }
}