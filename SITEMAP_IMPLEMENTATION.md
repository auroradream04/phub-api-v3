# Sitemap Implementation

## Overview

This Next.js video platform uses the official Next.js sitemap feature to generate comprehensive, partitioned sitemaps that comply with Google's sitemap standards.

## Implementation Details

### Files Created

1. **`/src/app/sitemap.ts`** - Main sitemap generator with partitioning support
2. **`/src/app/robots.ts`** - Robots.txt configuration

### Architecture

#### Partitioned Sitemaps

Due to the large number of videos (~167,965), the sitemap is split into multiple files:

- **Maximum URLs per sitemap**: 40,000 (Google's limit is 50,000)
- **Total sitemaps generated**: 5 sitemaps
  - Sitemap 0: 40,000 URLs (4 static pages + 39,996 videos)
  - Sitemap 1: 40,000 URLs (videos only)
  - Sitemap 2: 40,000 URLs (videos only)
  - Sitemap 3: 40,000 URLs (videos only)
  - Sitemap 4: ~7,965 URLs (remaining videos)

#### Static Pages Included

- Homepage: `/` (priority: 1.0, changefreq: daily)
- Search: `/search` (priority: 0.8, changefreq: daily)
- Docs: `/docs` (priority: 0.5, changefreq: weekly)
- MacCMS Docs: `/docs/maccms` (priority: 0.5, changefreq: weekly)

#### Video Pages

Each video page includes:
- URL: `${BASE_URL}/watch/${vodId}`
- Last Modified: From `updatedAt` field
- Priority: 0.8
- Change Frequency: weekly
- Images: Video thumbnail URL (using image sitemap format)

#### Pages Excluded

The following routes are excluded from the sitemap:
- Admin routes: `/admin/*`
- Auth pages: `/login`, `/register`
- API routes: `/api/*`

## URLs

### Development

- Sitemap Index: `http://localhost:4444/sitemap.xml` (only works in production)
- Individual Sitemaps:
  - `http://localhost:4444/sitemap/0.xml`
  - `http://localhost:4444/sitemap/1.xml`
  - `http://localhost:4444/sitemap/2.xml`
  - `http://localhost:4444/sitemap/3.xml`
  - `http://localhost:4444/sitemap/4.xml`
- Robots.txt: `http://localhost:4444/robots.txt`

### Production

When deployed, Next.js will automatically generate a sitemap index at:
- Sitemap Index: `${NEXT_PUBLIC_APP_URL}/sitemap.xml`

The sitemap index will reference all individual sitemaps:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://yourdomain.com/sitemap/0.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://yourdomain.com/sitemap/1.xml</loc>
  </sitemap>
  <!-- ... more sitemaps -->
</sitemapindex>
```

## Configuration

### Environment Variables

The sitemap uses the following environment variable for the base URL:
- `NEXT_PUBLIC_APP_URL` - The public URL of your application

**Current value**: `http://localhost:4444` (development)

In production, update this to your actual domain:
```env
NEXT_PUBLIC_APP_URL="https://yourdomain.com"
```

## Database Query Optimization

The sitemap implementation is optimized for performance:

```typescript
// Only selects required fields
const videos = await prisma.video.findMany({
  select: {
    vodId: true,
    vodName: true,
    vodPic: true,
    updatedAt: true,
  },
  orderBy: {
    updatedAt: 'desc',
  },
  skip: start,
  take: MAX_URLS_PER_SITEMAP,
})
```

This approach:
- Uses pagination (`skip` and `take`) to fetch only the needed videos per sitemap
- Selects only the 4 fields needed for the sitemap
- Orders by `updatedAt` to ensure most recent videos appear first

## Robots.txt

The `robots.txt` file is configured to:
- Allow all crawlers to access public pages
- Disallow admin, auth, and API routes
- Reference the sitemap index

Example output:
```
User-Agent: *
Allow: /
Disallow: /admin/
Disallow: /login
Disallow: /register
Disallow: /api/

Sitemap: http://localhost:4444/sitemap.xml
```

## Image Sitemaps

Each video entry includes image sitemap metadata using the official image sitemap extension:

```xml
<url>
  <loc>http://localhost:4444/watch/video-id</loc>
  <image:image>
    <image:loc>https://thumbnail-url.jpg</image:loc>
  </image:image>
  <lastmod>2025-11-03T23:21:31.558Z</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.8</priority>
</url>
```

This helps search engines discover and index video thumbnails.

## SEO Benefits

1. **Complete Coverage**: All public video pages are included
2. **Fresh Content**: Uses `updatedAt` timestamps for last modified dates
3. **Image Discovery**: Thumbnails are included for better image SEO
4. **Proper Prioritization**: Homepage and search get higher priority
5. **Partitioning**: Complies with Google's 50,000 URL limit per sitemap
6. **Change Frequency**: Appropriate update frequencies guide crawler behavior

## Submitting to Search Engines

### Google Search Console

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Select your property
3. Navigate to Sitemaps
4. Submit: `https://yourdomain.com/sitemap.xml`

Google will automatically discover and crawl all partitioned sitemaps.

### Bing Webmaster Tools

1. Go to [Bing Webmaster Tools](https://www.bing.com/webmasters)
2. Select your site
3. Navigate to Sitemaps
4. Submit: `https://yourdomain.com/sitemap.xml`

## Monitoring

Check sitemap generation logs in the console:

```
Generating 5 sitemap(s) for 167965 videos
Generated sitemap 0 with 40000 URLs (4 static + 39996 videos)
Generated sitemap 1 with 40000 URLs (0 static + 40000 videos)
...
```

## Maintenance

The sitemap automatically updates when:
- New videos are added to the database
- Videos are updated (changes `updatedAt` timestamp)
- Static pages are modified

No manual regeneration is needed - Next.js handles this automatically on each request in development and at build time in production.

## Performance Considerations

- **Build Time**: Each sitemap is generated on-demand in development
- **Production**: Sitemaps are generated at build time and cached
- **Database Load**: Optimized queries with field selection and pagination
- **Memory**: Processes videos in chunks of 40,000 to avoid memory issues

## Future Enhancements

Potential improvements:
- Add category pages to sitemap
- Include trending pages
- Add `<video:video>` tags for video-specific metadata (title, description, duration, etc.)
- Implement ISR (Incremental Static Regeneration) for sitemap updates
- Add sitemap for categories and tags

## Troubleshooting

### Sitemap not appearing in development

This is normal. In development mode, only individual sitemaps are accessible at `/sitemap/[id].xml`. The sitemap index at `/sitemap.xml` only works in production.

### Videos missing from sitemap

Ensure the database connection is working and videos have the required fields:
- `vodId`
- `vodName`
- `vodPic`
- `updatedAt`

### Sitemap too large

If the video count grows beyond 2,000,000 (50 sitemaps * 40,000 URLs), you may need to:
1. Reduce `MAX_URLS_PER_SITEMAP`
2. Implement additional filtering (e.g., only include published videos)
3. Consider a multi-level sitemap strategy

## References

- [Next.js Sitemap Documentation](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- [Google Sitemap Protocol](https://www.sitemaps.org/protocol.html)
- [Google Image Sitemap Extension](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps)
