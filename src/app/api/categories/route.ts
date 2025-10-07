import { NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'

// Initialize PornHub client
const pornhub = new PornHub()

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

    return NextResponse.json({
      categories: formattedCategories,
      total: formattedCategories.length
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