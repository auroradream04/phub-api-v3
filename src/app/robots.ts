import { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://api.md8av.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Admin and authentication routes
          '/admin',
          '/admin/*',
          '/login',
          '/register',
          // API endpoints that should not be indexed
          '/api/admin/*',
          '/api/auth/*',
          '/api/scraper/*',
          '/api/embed/*',
          '/api/ads/serve/*',
          '/api/cache/*',
          // Private upload directories
          '/private/*',
          '/public/uploads/*',
          // Search endpoints that don't need indexing
          '/api/search/*',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
