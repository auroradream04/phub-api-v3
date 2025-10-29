import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const revalidate = 7200 // 2 hours

// POST endpoint to scrape videos from all categories

export async function POST(request: NextRequest) {
  try {
    const { pagesPerCategory = 5, parallel = false } = await request.json()

    const baseUrl = process.env.NEXTAUTH_URL || 'http://md8av.com'

    // Fetch categories directly from database (instant!)
    let categories = await prisma.category.findMany({
      orderBy: [
        { isCustom: 'desc' }, // Custom categories first
        { id: 'asc' }
      ]
    })

    // If no categories in DB, fetch from PornHub and save them
    if (categories.length === 0) {
      try {
        const { PornHub } = await import('pornhub.js')
        const { getRandomProxy } = await import('@/lib/proxy')

        const pornhub = new PornHub()
        const proxyInfo = getRandomProxy('Scraper Categories Fetch')
        if (proxyInfo) {
          pornhub.setAgent(proxyInfo.agent)
        }

        const pornhubCategories = await pornhub.webMaster.getCategories()

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
      } catch (error) {
        return NextResponse.json({
          success: false,
          message: 'No categories found in database and failed to fetch from PornHub. Please check logs.',
        }, { status: 500 })
      }
    } else {
    }


    let totalScraped = 0
    let totalErrors = 0
    const results = []

    if (parallel) {
      // Parallel scraping - scrape multiple categories at once

      const BATCH_SIZE = 5 // Scrape 5 categories at once

      for (let i = 0; i < categories.length; i += BATCH_SIZE) {
        const batch = categories.slice(i, i + BATCH_SIZE)

        // Scrape all categories in this batch in parallel
        const batchPromises = batch.map(async (category) => {
          let categoryScraped = 0
          let categoryErrors = 0

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

                // Stop if no videos were scraped (likely rate limited or no more content)
                if (scraperData.scraped === 0 || !scraperData.hasMore) {
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

      }

    } else {
      // Sequential scraping - one category at a time

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

            if (!scraperResponse.ok) {
              categoryErrors++
              totalErrors++
              continue
            }

            const scraperData = await scraperResponse.json()

            if (scraperData.success) {
              categoryScraped += scraperData.scraped
              totalScraped += scraperData.scraped

              // Stop if no videos were scraped (likely rate limited or no more content)
              if (scraperData.scraped === 0 || !scraperData.hasMore) {
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