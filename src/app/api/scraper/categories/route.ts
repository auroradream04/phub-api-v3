import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const revalidate = 7200 // 2 hours

// POST endpoint to scrape videos from all categories
const FETCH_TIMEOUT = 30000 // 30 second timeout for fetch requests

// Helper to fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}) {
  const timeout = options.timeout || FETCH_TIMEOUT
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { pagesPerCategory = 5, parallel = false } = await request.json()

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

    // Fetch categories directly from database (instant!)
    console.log('[Scraper] Fetching categories from database cache...')
    const categories = await prisma.category.findMany({
      orderBy: [
        { isCustom: 'desc' }, // Custom categories first
        { id: 'asc' }
      ]
    })

    if (categories.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No categories found. Please visit /api/categories?refresh=true to fetch categories first.',
      }, { status: 200 })
    }

    console.log(`[Scraper] ✓ Loaded ${categories.length} categories from cache (instant)`)


    let totalScraped = 0
    let totalErrors = 0
    const results = []

    if (parallel) {
      // Parallel scraping - scrape multiple categories at once
      console.log(`[Scraper] 🚀 Parallel mode: Scraping up to 5 categories simultaneously`)

      const BATCH_SIZE = 5 // Scrape 5 categories at once

      for (let i = 0; i < categories.length; i += BATCH_SIZE) {
        const batch = categories.slice(i, i + BATCH_SIZE)
        console.log(`[Scraper] Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(categories.length/BATCH_SIZE)} (${batch.length} categories)`)

        // Scrape all categories in this batch in parallel
        const batchPromises = batch.map(async (category) => {
          let categoryScraped = 0
          let categoryErrors = 0

          for (let page = 1; page <= pagesPerCategory; page++) {
            try {
              const scraperResponse = await fetchWithTimeout(`${baseUrl}/api/scraper/videos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  page,
                  categoryId: category.id,
                  categoryName: category.name
                }),
                timeout: 30000,
              })

              const scraperData = await scraperResponse.json()

              if (scraperData.success) {
                categoryScraped += scraperData.scraped

                if (!scraperData.hasMore) {
                  break
                }
              } else {
                categoryErrors++
              }

              await new Promise(resolve => setTimeout(resolve, 200))

            } catch (error) {
              categoryErrors++
            }
          }

          return {
            category: category.name,
            categoryId: category.id,
            scraped: categoryScraped,
            errors: categoryErrors,
          }
        })

        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)

        // Update totals
        for (const result of batchResults) {
          totalScraped += result.scraped
          totalErrors += result.errors
        }

        console.log(`[Scraper] Batch complete: ${batchResults.reduce((sum, r) => sum + r.scraped, 0)} videos`)
      }

    } else {
      // Sequential scraping - one category at a time
      console.log(`[Scraper] Sequential mode: Scraping categories one by one`)

      for (const category of categories) {
        let categoryScraped = 0
        let categoryErrors = 0

        // Scrape specified number of pages for this category
        for (let page = 1; page <= pagesPerCategory; page++) {
          try {
            const scraperResponse = await fetchWithTimeout(`${baseUrl}/api/scraper/videos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                page,
                categoryId: category.id,
                categoryName: category.name
              }),
              timeout: 30000,
            })

            const scraperData = await scraperResponse.json()

            if (scraperData.success) {
              categoryScraped += scraperData.scraped
              totalScraped += scraperData.scraped

              if (!scraperData.hasMore) {
                break
              }
            } else {
              categoryErrors++
              totalErrors++
            }

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