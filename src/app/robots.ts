import { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4444'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/*',
          '/login',
          '/register',
          '/api/admin/*',
          '/api/auth/*',
          '/api/scraper/*',
          '/api/embed/*',
          '/api/ads/serve/*',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
