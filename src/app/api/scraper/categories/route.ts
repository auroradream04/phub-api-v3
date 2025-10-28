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
    let categories = await prisma.category.findMany({
      orderBy: [
        { isCustom: 'desc' }, // Custom categories first
        { id: 'asc' }
      ]
    })

    // If no categories in DB, fetch from PornHub and save them
    if (categories.length === 0) {
      console.log('[Scraper] No categories in DB, fetching from PornHub...')
      try {
        const { PornHub } = await import('pornhub.js')
        const { getRandomProxy } = await import('@/lib/proxy')

        const pornhub = new PornHub()
        const proxyInfo = getRandomProxy('Scraper Categories Fetch')
        if (proxyInfo) {
          pornhub.setAgent(proxyInfo.agent)
        }

        const pornhubCategories = await pornhub.webMaster.getCategories()
        console.log(`[Scraper] Got ${pornhubCategories.length} categories from PornHub`)

        // Save to database
        for (const cat of pornhubCategories) {
          await prisma.category.upsert({
            where: { id: Number(cat.id) },
            update: {},
            create: {
              id: Number(cat.id),
              name: cat.category,
              isCustom: false
            }
          })
        }

        // Also add custom categories
        const customCats = [
          { id: 9999, name: 'japanese' },
          { id: 9998, name: 'chinese' }
        ]
        for (const cat of customCats) {
          await prisma.category.upsert({
            where: { id: cat.id },
            update: {},
            create: {
              id: cat.id,
              name: cat.name,
              isCustom: true
            }
          })
        }

        // Fetch again from DB
        categories = await prisma.category.findMany({
          orderBy: [
            { isCustom: 'desc' },
            { id: 'asc' }
          ]
        })

        console.log(`[Scraper] ✓ Saved and loaded ${categories.length} categories from PornHub`)
      } catch (error) {
        console.error('[Scraper] Failed to fetch categories from PornHub:', error)
        return NextResponse.json({
          success: false,
          message: 'No categories found in database and failed to fetch from PornHub. Please check logs.',
        }, { status: 500 })
      }
    } else {
      console.log(`[Scraper] ✓ Loaded ${categories.length} categories from cache`)
    }


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
        console.log(`[Scraper] Starting category: ${category.name} (ID: ${category.id})`)
        for (let page = 1; page <= pagesPerCategory; page++) {
          try {
            console.log(`[Scraper] Fetching ${category.name} page ${page}...`)
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

            if (!scraperResponse.ok) {
              console.error(`[Scraper] Bad response for ${category.name} page ${page}: ${scraperResponse.status}`)
              categoryErrors++
              totalErrors++
              continue
            }

            const scraperData = await scraperResponse.json()
            console.log(`[Scraper] Got response for ${category.name} page ${page}: ${scraperData.scraped || 0} videos`)

            if (scraperData.success) {
              categoryScraped += scraperData.scraped
              totalScraped += scraperData.scraped

              if (!scraperData.hasMore) {
                console.log(`[Scraper] No more results for ${category.name}`)
                break
              }
            } else {
              console.error(`[Scraper] Failed to scrape ${category.name} page ${page}`)
              categoryErrors++
              totalErrors++
            }

            await new Promise(resolve => setTimeout(resolve, 500))

          } catch (error) {
            console.error(`[Scraper] Error scraping ${category.name} page ${page}:`, error instanceof Error ? error.message : error)
            categoryErrors++
            totalErrors++
          }
        }
        console.log(`[Scraper] Finished category: ${category.name} - Scraped: ${categoryScraped}, Errors: ${categoryErrors}`)

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