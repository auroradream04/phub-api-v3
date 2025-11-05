import { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4444'

// Google's limit is 50,000 URLs per sitemap, we'll use 40,000 to be safe
// This leaves room for static pages and some buffer
const MAX_URLS_PER_SITEMAP = 40000

/**
 * Generate sitemap index based on video count
 * This creates multiple sitemaps if video count exceeds MAX_URLS_PER_SITEMAP
 */
export async function generateSitemaps() {
  try {
    const videoCount = await prisma.video.count()
    const numSitemaps = Math.ceil(videoCount / MAX_URLS_PER_SITEMAP)

    console.log(`Generating ${numSitemaps} sitemap(s) for ${videoCount} videos`)

    return Array.from({ length: numSitemaps }, (_, i) => ({
      id: i,
    }))
  } catch (error) {
    console.error('Error generating sitemap index:', error)
    // Return at least one sitemap on error
    return [{ id: 0 }]
  }
}

/**
 * Generate individual sitemap by ID
 * Each sitemap contains up to MAX_URLS_PER_SITEMAP videos
 * Static pages are only included in the first sitemap (id: 0)
 */
export default async function sitemap({
  id,
}: {
  id: number
}): Promise<MetadataRoute.Sitemap> {
  const start = id * MAX_URLS_PER_SITEMAP

  // Static pages only in the first sitemap
  const staticPages: MetadataRoute.Sitemap =
    id === 0
      ? [
          {
            url: BASE_URL,
            lastModified: new Date(),
            changeFrequency: 'daily' as const,
            priority: 1.0,
          },
          {
            url: `${BASE_URL}/search`,
            lastModified: new Date(),
            changeFrequency: 'daily' as const,
            priority: 0.8,
          },
          {
            url: `${BASE_URL}/docs`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.5,
          },
          {
            url: `${BASE_URL}/docs/maccms`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.5,
          },
        ]
      : []

  try {
    // Fetch videos for this sitemap partition
    const videos = await prisma.video.findMany({
      select: {
        vodId: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      skip: start,
      take: MAX_URLS_PER_SITEMAP,
    })

    // Generate video pages - simple URLs only
    const videoPages: MetadataRoute.Sitemap = videos.map((video) => ({
      url: `${BASE_URL}/watch/${video.vodId}`,
      lastModified: video.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))

    console.log(
      `Generated sitemap ${id} with ${staticPages.length + videoPages.length} URLs (${staticPages.length} static + ${videoPages.length} videos)`
    )

    return [...staticPages, ...videoPages]
  } catch (error) {
    console.error('Error generating sitemap:', error)
    // Return static pages on error
    return staticPages
  }
}
