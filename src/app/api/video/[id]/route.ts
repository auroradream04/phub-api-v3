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
    let videoInfo = null

    // ALWAYS use proxy - try up to 3 different proxies
    let retries = 3
    let attemptNum = 1

    while (retries > 0 && !videoInfo) {
      // Select proxy BEFORE making request
      const proxyInfo = getRandomProxy('Video API')

      if (!proxyInfo) {
        console.warn('[Video] No proxies available. Cannot make request.')
        break
      }

      console.log(`[Video] Attempt ${attemptNum}/3 for video ${id} using proxy ${proxyInfo.proxyUrl}`)
      pornhub.setAgent(proxyInfo.agent)

      const startTime = Date.now()
      try {
        const response = await pornhub.video(id)

        const duration = Date.now() - startTime

        // Check for soft blocking (missing media definitions)
        if (!response.mediaDefinitions || response.mediaDefinitions.length < 1) {
          console.log(`[Video] ⚠️  Proxy ${proxyInfo.proxyUrl} returned empty media definitions (soft block) after ${duration}ms - trying different proxy...`)
        } else {
          console.log(`[Video] ✅ Proxy ${proxyInfo.proxyUrl} successful! Got ${response.mediaDefinitions.length} quality options in ${duration}ms`)
          videoInfo = response
        }
      } catch (error: unknown) {
        const duration = Date.now() - startTime
        console.error(`[Video] ❌ Proxy ${proxyInfo.proxyUrl} failed after ${duration}ms:`, error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
      attemptNum++
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