import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const revalidate = 3600 // Cache for 1 hour

export async function GET() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4444'

    // Fetch latest 50 videos
    const videos = await prisma.video.findMany({
      select: {
        vodId: true,
        vodName: true,
        vodPic: true,
        vodRemarks: true,
        views: true,
        typeName: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 50
    })

    // Generate RSS feed
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>MD8AV - Latest Videos</title>
    <link>${baseUrl}</link>
    <description>最新视频更新 - MD8AV成人视频平台</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml"/>
    ${videos.map((video) => `
    <item>
      <title><![CDATA[${video.vodName}]]></title>
      <link>${baseUrl}/watch/${video.vodId}</link>
      <guid isPermaLink="true">${baseUrl}/watch/${video.vodId}</guid>
      <description><![CDATA[时长: ${video.vodRemarks || 'N/A'} | 观看: ${video.views.toLocaleString()} | 分类: ${video.typeName}]]></description>
      <pubDate>${new Date(video.updatedAt).toUTCString()}</pubDate>
      <category><![CDATA[${video.typeName}]]></category>${video.vodPic ? `
      <media:thumbnail url="${video.vodPic}"/>` : ''}
    </item>`).join('')}
  </channel>
</rss>`

    return new NextResponse(rss, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })
  } catch (error) {
    console.error('[RSS] Error generating feed:', error)

    // Return minimal valid RSS on error
    const errorRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>MD8AV - Latest Videos</title>
    <link>${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4444'}</link>
    <description>Error generating feed</description>
  </channel>
</rss>`

    return new NextResponse(errorRss, {
      status: 500,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
      },
    })
  }
}
