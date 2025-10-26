import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 7200 // 2 hours

// POST endpoint to scrape videos from all categories
export async function POST(request: NextRequest) {
  try {
    const { pagesPerCategory = 5 } = await request.json()

    const baseUrl = process.env.NEXTAUTH_URL || 'http://md8av.com'

    // First, fetch all categories
    const categoriesResponse = await fetch(`${baseUrl}/api/categories`)
    if (!categoriesResponse.ok) {
      throw new Error(`Failed to fetch categories: ${categoriesResponse.statusText}`)
    }

    const categoriesData = await categoriesResponse.json()
    const categories = categoriesData.categories || []

    if (categories.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No categories found',
      }, { status: 200 })
    }

    let totalScraped = 0
    let totalErrors = 0
    const results = []

    // Iterate through each category
    for (const category of categories) {
      let categoryScraped = 0
      let categoryErrors = 0



      // Scrape specified number of pages for this category
      for (let page = 1; page <= pagesPerCategory; page++) {
        try {
          const scraperResponse = await fetch(`${baseUrl}/api/scraper/videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              page,
              categoryId: category.id,
              categoryName: category.name
            }),
          })

          const scraperData = await scraperResponse.json()

          if (scraperData.success) {
            categoryScraped += scraperData.scraped
            totalScraped += scraperData.scraped



            // If no more pages available for this category, break
            if (!scraperData.hasMore) {

              break
            }
          } else {
            categoryErrors++
            totalErrors++

          }

          // Small delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500))

        } catch (error) {
          categoryErrors++
          totalErrors++

        }
      }

      results.push({
        category: category.name,
        categoryId: category.id,
        scraped: categoryScraped,
        errors: categoryErrors,
      })
    }

    return NextResponse.json({
      success: true,
      message: `Scraped ${totalScraped} videos from ${categories.length} categories`,
      totalScraped,
      totalErrors,
      results,
      pagesPerCategory,
    }, { status: 200 })

  } catch (error) {

    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}