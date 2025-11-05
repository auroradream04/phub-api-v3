import { prisma } from '@/lib/prisma'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4444'

// Helper function to escape XML special characters
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  try {
    // Fetch the 500 most recent videos (RSS readers typically handle this fine)
    const videos = await prisma.video.findMany({
      select: {
        vodId: true,
        vodName: true,
        vodPic: true,
        vodRemarks: true,
        vodContent: true,
        createdAt: true,
        typeName: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 500,
    })

    const rssFeed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>MD8AV - 高品质视频内容聚合平台</title>
  <link>${BASE_URL}</link>
  <description>探索最新最热门的视频内容，涵盖多个分类的精选视频集合</description>
  <language>zh-CN</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
  ${videos
    .map((video) => {
      // Clean description for RSS (remove HTML tags if any)
      const rawDescription = video.vodContent
        ? video.vodContent.replace(/<[^>]*>/g, '').substring(0, 200)
        : video.vodRemarks || '暂无描述'

      const description = escapeXml(rawDescription)
      const title = escapeXml(video.vodName)
      const category = escapeXml(video.typeName || '未分类')

      return `
  <item>
    <title>${title}</title>
    <link>${BASE_URL}/watch/${video.vodId}</link>
    <guid isPermaLink="true">${BASE_URL}/watch/${video.vodId}</guid>
    <description>${description}</description>
    <pubDate>${video.createdAt.toUTCString()}</pubDate>
    <category>${category}</category>
    ${video.vodPic ? `<enclosure url="${escapeXml(video.vodPic)}" type="image/jpeg" />` : ''}
  </item>`
    })
    .join('')}
</channel>
</rss>`

    return new Response(rssFeed, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })
  } catch (error) {
    console.error('Error generating RSS feed:', error)
    return new Response('Error generating RSS feed', { status: 500 })
  }
}
