import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'

export const revalidate = 7200 // 2 hours

// ANSI color codes for console styling
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
}

function log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) {
  const timestamp = new Date().toISOString()
  const prefix = `${colors.bright}[Watch API]${colors.reset}`

  const levelColors = {
    info: colors.blue,
    warn: colors.yellow,
    error: colors.red,
    debug: colors.magenta,
  }

  const coloredLevel = `${levelColors[level]}${level.toUpperCase()}${colors.reset}`

  console.log(`${prefix} ${colors.dim}${timestamp}${colors.reset} ${coloredLevel} - ${message}`)

  if (data !== undefined) {
    console.log(`${prefix} ${colors.dim}└─ Data:${colors.reset}`, data)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const requestId = Math.random().toString(36).substring(7)
  let apiCallTime = 0

  try {
    // Log incoming request
    log('info', `Request received: GET /api/watch/[id]`, {
      requestId,
      url: request.url,
      headers: {
        'user-agent': request.headers.get('user-agent'),
        'referer': request.headers.get('referer'),
      }
    })

    const { id } = await params
    log('debug', `Extracted video ID from params`, { videoId: id, requestId })

    // Validate video ID
    if (!id || id.trim() === '') {
      log('warn', `Invalid video ID: empty or missing`, { videoId: id, requestId })

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

      log('info', `Response: 400 Bad Request`, { requestId, responseTime: `${Date.now() - startTime}ms` })
      return NextResponse.json(response, { status: 400 })
    }

    // Create PornHub client instance (fresh for each request to support proxy switching)
    const pornhub = new PornHub({
      dumpPage: process.env.NODE_ENV === 'development' // Enable debug dumps in development
    })

    // Log PornHub API call
    log('info', `Fetching from PornHub API for video`, {
      videoId: id,
      method: 'pornhub.video()',
      requestId
    })

    const apiStartTime = Date.now()

    // Fetch video from PornHub API with retry logic
    let videoData = null
    let lastError: Error | null = null

    // ALWAYS use proxy - try up to 3 different proxies
    let retries = 3
    let attemptNum = 1

    while (retries > 0 && !videoData) {
      // Select proxy BEFORE making request
      const proxyInfo = getRandomProxy('Watch API')

      if (!proxyInfo) {
        log('warn', `No proxies available - cannot make request`, { videoId: id, requestId })
        break
      }

      log('info', `Attempt ${attemptNum}/3 for video ${id} using proxy ${proxyInfo.proxyUrl}`, { videoId: id, requestId })
      pornhub.setAgent(proxyInfo.agent)

      try {
        videoData = await pornhub.video(id)
        log('info', `✅ Proxy ${proxyInfo.proxyUrl} successful for video ${id}`, { videoId: id, retries, requestId })
        break
      } catch (apiError) {
        lastError = apiError instanceof Error ? apiError : new Error(String(apiError))

        // Check if it's a 404 error (video not found) - don't retry with more proxies for 404s
        if (lastError.message.includes('404')) {
          log('warn', `Video not found on PornHub API (404)`, { videoId: id, requestId })

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

          log('info', `Response: 404 Not Found`, {
            videoId: id,
            requestId,
            responseTime: `${Date.now() - startTime}ms`
          })
          return NextResponse.json(response, { status: 404 })
        }

        log('warn', `❌ Proxy ${proxyInfo.proxyUrl} failed for video ${id}`, {
          videoId: id,
          error: lastError.message,
          retriesRemaining: retries - 1,
          requestId
        })
      }

      retries--
      attemptNum++
    }

    apiCallTime = Date.now() - apiStartTime
    log('debug', `PornHub API call completed`, {
      videoId: id,
      apiCallTime: `${apiCallTime}ms`,
      found: !!videoData,
      requestId
    })

    if (!videoData) {
      log('warn', `Video data is empty from PornHub API`, { videoId: id, requestId })

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

      log('info', `Response: 404 Not Found`, {
        videoId: id,
        requestId,
        responseTime: `${Date.now() - startTime}ms`
      })
      return NextResponse.json(response, { status: 404 })
    }

    log('info', `Video found successfully`, {
      videoId: id,
      title: videoData.title,
      duration: videoData.durationFormatted,
      views: videoData.views,
      requestId
    })

    // Get base URL from request headers (for proxy URL generation)
    const protocol = request.headers.get('x-forwarded-proto') || 'http'
    const host = request.headers.get('host') || 'md8av.com'
    const baseUrl = `${protocol}://${host}`

    log('debug', `Constructing video response`, {
      baseUrl,
      videoId: id,
      requestId
    })

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
      provider: videoData.provider,
      premium: videoData.premium || false,
      id: videoData.id,
      url: videoData.url,
      thumb: videoData.thumb,
      vote: videoData.vote
    }

    const responseTime = Date.now() - startTime
    log('info', `Response: 200 OK - Video info sent successfully`, {
      videoId: id,
      videoTitle: videoData.title,
      requestId,
      responseTime: `${responseTime}ms`,
      apiCallTime: `${apiCallTime}ms`,
      mediaDefinitionsCount: videoInfo.mediaDefinitions.length,
      tagsCount: videoInfo.tags.length,
      pornstarsCount: videoInfo.pornstars.length,
      categoriesCount: videoInfo.categories.length
    })

    return NextResponse.json(videoInfo, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=7200'
      }
    })

  } catch (error) {
    const responseTime = Date.now() - startTime
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

    log('error', `Error processing request`, {
      videoId: await params.then(p => p.id).catch(() => 'unknown'),
      error: errorDetails,
      stack: isDevMode ? (error instanceof Error ? error.stack : undefined) : undefined,
      requestId,
      responseTime: `${responseTime}ms`
    })

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

    log('info', `Response: 500 Internal Server Error`, {
      requestId,
      responseTime: `${responseTime}ms`
    })

    return NextResponse.json(response, { status: 500 })
  }
}