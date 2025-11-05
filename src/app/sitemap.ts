import { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://api.md8av.com'

/**
 * Generate sitemap with static pages and recent videos
 * Limited to 50,000 URLs per Google's sitemap spec
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/search`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/docs/maccms`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ]

  try {
    // Fetch recent videos (limit to 10,000 to keep sitemap reasonable)
    const videos = await prisma.video.findMany({
      select: {
        vodId: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 10000,
    })

    // Generate video pages
    const videoPages: MetadataRoute.Sitemap = videos.map((video) => ({
      url: `${BASE_URL}/watch/${video.vodId}`,
      lastModified: video.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

    console.log(
      `Generated sitemap with ${staticPages.length + videoPages.length} URLs (${staticPages.length} static + ${videoPages.length} videos)`
    )

    return [...staticPages, ...videoPages]
  } catch (error) {
    console.error('Error generating sitemap:', error)
    // Return static pages on error
    return staticPages
  }
}
