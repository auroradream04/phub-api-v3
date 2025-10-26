import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { checkAndLogDomain } from '@/lib/domain-middleware'

// Custom categories that use search instead of PornHub category IDs
// Use high numeric IDs (9998-9999) to avoid conflicts with PornHub category IDs
// NOTE: Display names are capitalized but search queries must be lowercase (PornHub bug)
const CUSTOM_CATEGORIES = [
  { id: 9999, name: 'Japanese' },
  { id: 9998, name: 'Chinese' }
]

export const revalidate = 7200 // 2 hours

export async function GET(request: NextRequest) {
  const requestStart = Date.now()

  // Check domain access
  const domainCheck = await checkAndLogDomain(request, '/api/categories', 'GET')
  if (!domainCheck.allowed) {
    return domainCheck.response
  }

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
        break
      }

      pornhub.setAgent(proxyInfo.agent)

      try {
        // Fetch categories from PornHub using the WebMaster API
        const response = await pornhub.webMaster.getCategories()

        // Check for soft blocking (empty results)
        if (!response || response.length === 0) {
          // Try different proxy
        } else {
          categories = response
        }
      } catch (error: unknown) {
        // Try different proxy
      }

      retries--
      attemptNum++
    }

    if (!categories || categories.length === 0) {
      await domainCheck.logRequest(500, Date.now() - requestStart)
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

    // Log successful request
    await domainCheck.logRequest(200, Date.now() - requestStart)

    return NextResponse.json({
      categories: allCategories,
      total: allCategories.length
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch categories from PornHub'
      },
      { status: 500 }
    )
  }
}