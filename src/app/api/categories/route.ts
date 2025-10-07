import { NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'

// Initialize PornHub client
const pornhub = new PornHub()

// Custom categories that use search instead of PornHub category IDs
// Use high numeric IDs (9998-9999) to avoid conflicts with PornHub category IDs
const CUSTOM_CATEGORIES = [
  { id: 9999, name: 'Japanese' },
  { id: 9998, name: 'Chinese' }
]

export async function GET() {
  try {
    // Fetch categories from PornHub using the WebMaster API
    const categories = await pornhub.webMaster.getCategories()

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