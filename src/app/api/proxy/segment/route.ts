import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 7200 // 2 hours

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url')

    if (!url) {
      return NextResponse.json(
        { error: 'Missing URL parameter' },
        { status: 400 }
      )
    }

    // Decode the URL
    const segmentUrl = decodeURIComponent(url)
    console.log(`[Proxy] Fetching segment: ${segmentUrl.split('/').pop()}`)

    // Fetch the segment from the original URL with proper headers
    const response = await fetch(segmentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.pornhub.com/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Connection': 'keep-alive'
      }
    })

    if (!response.ok) {
      console.error(`[Proxy] Failed to fetch segment: ${response.status} ${response.statusText}`)
      return NextResponse.json(
        { error: `Failed to fetch segment: ${response.status}` },
        { status: response.status }
      )
    }

    // Get the content
    const buffer = await response.arrayBuffer()

    // Return the segment with proper headers
    return new Response(buffer, {
      headers: {
        'Content-Type': 'video/mp2t',
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Accept-Ranges': 'bytes',
        'Content-Disposition': 'inline'
      }
    })

  } catch (error) {
    console.error('[Proxy] Error fetching segment:', error)
    return NextResponse.json(
      { error: 'Failed to proxy segment' },
      { status: 500 }
    )
  }
}