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
    let categories

    // Always use proxy - retry with different proxies if needed
    let retries = 3
    while ((!categories || categories.length === 0) && retries > 0) {
      const proxyAgent = getRandomProxy()

      if (!proxyAgent) {
        console.warn('[Categories] No proxies available. Cannot retry.')
        break
      }

      console.log(`[Categories] Attempting request with random proxy (${retries} retries remaining)...`)
      pornhub.setAgent(proxyAgent)

      try {
        // Fetch categories from PornHub using the WebMaster API
        categories = await pornhub.webMaster.getCategories()

        // Check for soft blocking (empty results)
        if (!categories || categories.length === 0) {
          console.log('[Categories] Received empty results (possible soft block), retrying with different proxy...')
          categories = null
        }
      } catch (error: unknown) {
        console.error('[Categories] Request failed with proxy:', error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
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