import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { checkAndLogDomain } from '@/lib/domain-middleware'
import { prisma } from '@/lib/prisma'

// Custom categories that use search instead of PornHub category IDs
// Use high numeric IDs (9998-9999) to avoid conflicts with PornHub category IDs
// NOTE: Display names are capitalized but search queries must be lowercase (PornHub bug)
const CUSTOM_CATEGORIES = [
  { id: 9999, name: 'Japanese', isCustom: true },
  { id: 9998, name: 'Chinese', isCustom: true }
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
    // Check if we need to refresh categories
    const searchParams = request.nextUrl.searchParams
    const forceRefresh = searchParams.get('refresh') === 'true'

    // Try to get categories from database first
    if (!forceRefresh) {
      const cachedCategories = await prisma.category.findMany({
        orderBy: [
          { isCustom: 'desc' }, // Custom categories first
          { id: 'asc' }
        ]
      })

      // If we have cached categories, return them immediately
      if (cachedCategories.length > 0) {
        console.log(`[Categories API] ✓ Returned ${cachedCategories.length} categories from cache (instant)`)
        await domainCheck.logRequest(200, Date.now() - requestStart)

        return NextResponse.json({
          categories: cachedCategories.map(c => ({
            id: c.id,
            name: c.name
          })),
          total: cachedCategories.length,
          cached: true
        })
      }
    }

    // If no cache or force refresh, fetch from PornHub
    console.log('[Categories API] Fetching categories from PornHub...')

    const pornhub = new PornHub()
    let categories = null

    // ALWAYS use proxy - try up to 3 different proxies
    let retries = 3
    let attemptNum = 1

    while (retries > 0 && !categories) {
      const proxyInfo = getRandomProxy('Categories API')

      if (!proxyInfo) {
        console.error('[Categories API] No proxy available')
        break
      }

      pornhub.setAgent(proxyInfo.agent)

      try {
        const response = await pornhub.webMaster.getCategories()

        if (!response || response.length === 0) {
          console.warn(`[Categories API] Proxy ${proxyInfo.proxyUrl} returned empty results`)
        } else {
          console.log(`[Categories API] ✓ Fetched ${response.length} categories from PornHub`)
          categories = response
        }
      } catch (error: unknown) {
        console.error(`[Categories API] Proxy ${proxyInfo.proxyUrl} failed:`, error instanceof Error ? error.message : error)
      }

      retries--
      attemptNum++
    }

    if (!categories || categories.length === 0) {
      await domainCheck.logRequest(500, Date.now() - requestStart)
      throw new Error('Failed to fetch categories from PornHub')
    }

    // Store categories as-is from PornHub (no formatting)
    const formattedCategories = categories.map(cat => ({
      id: Number(cat.id),
      name: String(cat.category).toLowerCase(),
      isCustom: false
    }))

    // Save to database (upsert to avoid duplicates)
    console.log('[Categories API] Saving categories to database...')

    // Save custom categories first
    for (const cat of CUSTOM_CATEGORIES) {
      await prisma.category.upsert({
        where: { id: cat.id },
        update: { name: cat.name, isCustom: cat.isCustom },
        create: { id: cat.id, name: cat.name, isCustom: cat.isCustom }
      })
    }

    // Save PornHub categories
    for (const cat of formattedCategories) {
      await prisma.category.upsert({
        where: { id: cat.id },
        update: { name: cat.name, isCustom: cat.isCustom },
        create: { id: cat.id, name: cat.name, isCustom: cat.isCustom }
      })
    }

    const allCategories = [...CUSTOM_CATEGORIES, ...formattedCategories]

    console.log(`[Categories API] ✓ Saved ${allCategories.length} categories to database`)

    // Log successful request
    await domainCheck.logRequest(200, Date.now() - requestStart)

    return NextResponse.json({
      categories: allCategories.map(c => ({ id: c.id, name: c.name })),
      total: allCategories.length,
      cached: false,
      refreshed: true
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