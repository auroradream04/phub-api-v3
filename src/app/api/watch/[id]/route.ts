import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'

export const revalidate = 7200 // 2 hours

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const requestId = Math.random().toString(36).substring(7)
  const _apiCallTime = 0

  try {
    const { id } = await params

    // Validate video ID
    if (!id || id.trim() === '') {
      const response = {
        error: 'Invalid video ID',
        videoId: id || 'undefined',
        message: 'Video ID is required and cannot be empty',
        suggestions: [
          'Ensure the video ID is provided in the URL',
          'Video ID format should be alphanumeric (e.g., ph5a9634c9a827e)',
          'Try accessing via: /api/watch/{videoId}'
        ],
        timestamp: new Date().toISOString(),
        requestId
      }

      return NextResponse.json(response, { status: 400 })
    }

    // Create PornHub client instance (fresh for each request to support proxy switching)
    const pornhub = new PornHub({
      dumpPage: process.env.NODE_ENV === 'development' // Enable debug dumps in development
    })

    const apiStartTime = Date.now()

    // Fetch video from PornHub API with retry logic
    let videoData = null
    let lastError: Error | null = null

    // ALWAYS use proxy - try up to 3 different proxies
    let retries = 3
    const _attemptNum = 1

    while (retries > 0 && !videoData) {
      // Select proxy BEFORE making request
      const proxyInfo = getRandomProxy('Watch API')

      if (!proxyInfo) {
        console.error('[Watch API] No proxy available from proxy list')
        break
      }

      console.log(`[Watch API] Attempt ${attemptNum}/3 for video ${id}: Using proxy ${proxyInfo.proxyUrl}`)
      pornhub.setAgent(proxyInfo.agent)

      const startTime = Date.now()
      try {
        videoData = await pornhub.video(id)
        const _duration = Date.now() - startTime
        console.log(`[Watch API] ✓ Success with proxy ${proxyInfo.proxyUrl} (${duration}ms)`)
        break
      } catch (apiError) {
        const _duration = Date.now() - startTime
        lastError = apiError instanceof Error ? apiError : new Error(String(apiError))

        // Check if it's a 404 error (video not found) - don't retry with more proxies for 404s
        if (lastError.message.includes('404')) {
          console.warn(`[Watch API] Video ${id} not found (404) - stopping retries`)
          const response = {
            error: 'Video not found',
            videoId: id,
            message: 'The requested video does not exist on PornHub',
            suggestions: [
              'Check if the video ID is correct',
              'The video might have been removed or is not available',
              `Video ID format example: ph5a9634c9a827e (starts with 'ph' followed by alphanumeric characters)`
            ],
            timestamp: new Date().toISOString(),
            requestId
          }

          return NextResponse.json(response, { status: 404 })
        }

        console.error(`[Watch API] Proxy ${proxyInfo.proxyUrl} failed (${duration}ms):`, lastError.message)
      }

      retries--
      attemptNum++
    }

    apiCallTime = Date.now() - apiStartTime

    if (!videoData) {
      console.error(`[Watch API] ❌ All proxy attempts failed for video ${id}`)
      const response = {
        error: 'Video not found',
        videoId: id,
        message: 'The requested video returned empty data from PornHub',
        suggestions: [
          'Check if the video ID is correct',
          'Try searching for the video first using /api/search',
          'The video might have been removed or is not yet available'
        ],
        timestamp: new Date().toISOString(),
        requestId
      }

      return NextResponse.json(response, { status: 404 })
    }

    console.log(`[Watch API] Video metadata fetched successfully for ${id} (${videoData.mediaDefinitions?.length || 0} qualities)`)


    // Get base URL from request headers (for proxy URL generation)
    const protocol = request.headers.get('x-forwarded-proto') || 'http'
    const host = request.headers.get('host') || 'md8av.com'
    const baseUrl = `${protocol}://${host}`

    // Normalize provider - extract username if it's an object
    const normalizeProvider = (provider: unknown): string => {
      if (!provider) return ''
      if (typeof provider === 'string') return provider
      if (typeof provider === 'object' && provider !== null) {
        const obj = provider as Record<string, unknown>
        return (obj.username as string) || (obj.name as string) || ''
      }
      return ''
    }

    // Transform PornHub API response to our format
    const videoInfo = {
      title: videoData.title,
      views: videoData.views,
      rating: videoData.vote?.rating || 0,
      duration: videoData.durationFormatted,
      preview: videoData.preview || videoData.thumb || '',
      mediaDefinitions: videoData.mediaDefinitions?.map(def => ({
        quality: def.quality,
        videoUrl: `${baseUrl}/api/watch/${id}/stream.m3u8?q=${def.quality}`,
        format: def.format,
        defaultQuality: def.defaultQuality,
        remote: false
      })) || [
        // Fallback to our stream endpoints if no media definitions
        {
          quality: 1080,
          videoUrl: `${baseUrl}/api/watch/${id}/stream.m3u8?q=1080`,
          format: 'hls',
          defaultQuality: false,
          remote: false
        },
        {
          quality: 720,
          videoUrl: `${baseUrl}/api/watch/${id}/stream.m3u8?q=720`,
          format: 'hls',
          defaultQuality: true,
          remote: false
        },
        {
          quality: 480,
          videoUrl: `${baseUrl}/api/watch/${id}/stream.m3u8?q=480`,
          format: 'hls',
          defaultQuality: false,
          remote: false
        }
      ],
      tags: videoData.tags || [],
      pornstars: videoData.pornstars || [],
      categories: videoData.categories || [],
      uploadDate: videoData.uploadDate,
      provider: normalizeProvider(videoData.provider),
      premium: videoData.premium || false,
      id: videoData.id,
      url: videoData.url,
      thumb: videoData.thumb,
      vote: videoData.vote
    }

    return NextResponse.json(videoInfo, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=7200'
      }
    })

  } catch {
    const _responseTime = Date.now() - startTime
    const isDevMode = process.env.NODE_ENV === 'development'

    // Determine error type and details
    const errorDetails: {
      name: string
      message: string
      type?: string
      hint?: string
    } = {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
    }

    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
        errorDetails.type = 'APIConnectionError'
        errorDetails.hint = 'Cannot connect to PornHub API - service might be down or blocked'
      } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
        errorDetails.type = 'APITimeoutError'
        errorDetails.hint = 'PornHub API request timed out - try again later'
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        errorDetails.type = 'APIForbiddenError'
        errorDetails.hint = 'Access to PornHub API is forbidden - might be geo-blocked'
      } else if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
        errorDetails.type = 'APIRateLimitError'
        errorDetails.hint = 'Too many requests to PornHub API - please wait before trying again'
      } else {
        errorDetails.type = 'UnexpectedError'
      }
    }

    const response: {
      error: string
      message: string
      timestamp: string
      requestId: string
      suggestions: string[]
      debug?: {
        errorType?: string
        errorMessage: string
        hint?: string
        videoId: string
      }
    } = {
      error: 'Failed to fetch video information',
      message: 'An error occurred while fetching video from PornHub API',
      timestamp: new Date().toISOString(),
      requestId,
      suggestions: [
        'Try refreshing the page',
        'Check if the video ID is correct',
        'The PornHub API might be temporarily unavailable',
        'If the problem persists, try again in a few moments'
      ]
    }

    // Add detailed error info in development mode
    if (isDevMode) {
      response.debug = {
        errorType: errorDetails.type,
        errorMessage: errorDetails.message,
        hint: errorDetails.hint,
        videoId: await params.then(p => p.id).catch(() => 'unknown')
      }
    }

    return NextResponse.json(response, { status: 500 })
  }
}
