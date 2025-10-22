import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id || id.trim() === '') {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      )
    }

    const pornhub = new PornHub()
    let videoInfo

    // Always use proxy - retry with different proxies if needed
    let retries = 3
    while ((videoInfo === undefined || videoInfo === null || !videoInfo.mediaDefinitions || videoInfo.mediaDefinitions.length < 1) && retries > 0) {
      const proxyAgent = getRandomProxy()

      if (!proxyAgent) {
        console.warn('[Video] No proxies available. Cannot retry.')
        break
      }

      console.log(`[Video] Attempting request with random proxy (${retries} retries remaining)...`)
      pornhub.setAgent(proxyAgent)

      try {
        videoInfo = await pornhub.video(id)

        // Check for soft blocking (missing media definitions)
        if (!videoInfo.mediaDefinitions || videoInfo.mediaDefinitions.length < 1) {
          console.log('[Video] Received empty media definitions (possible soft block), retrying with different proxy...')
          videoInfo = null
        }
      } catch (error: unknown) {
        console.error('[Video] Request failed with proxy:', error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
    }

    if (!videoInfo || !videoInfo.mediaDefinitions || videoInfo.mediaDefinitions.length < 1) {
      throw new Error('Failed to fetch video information')
    }

    // Return original video info without any URL modifications
    return NextResponse.json(videoInfo, { status: 200 })

  } catch (error) {
    console.error('[Video] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch video information' },
      { status: 500 }
    )
  }
}