import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getProxiesForRacing, reportProxySuccess, reportProxyFailure, fetchViaProxyAgent } from '@/lib/proxy'
import { checkAndLogDomain } from '@/lib/domain-middleware'
import { processM3u8, isMasterPlaylist, extractFirstVariantUrl } from '@/lib/m3u8-processor'

export const revalidate = 7200 // 2 hours

// In-memory cache for PornHub video metadata (2 hour TTL)
const VIDEO_CACHE_TTL = 2 * 60 * 60 * 1000 // 2 hours in ms
const MAX_CACHE_SIZE = 1000 // Max videos to cache

interface CachedMediaDefinition {
  quality: number | number[] | string
  videoUrl: string
}

interface CachedVideo {
  mediaDefinitions: CachedMediaDefinition[]
  winnerProxyUrl: string
  cachedAt: number
}

const videoCache = new Map<string, CachedVideo>()

function getCachedVideo(videoId: string): CachedVideo | null {
  const cached = videoCache.get(videoId)
  if (!cached) return null

  // Check if expired
  if (Date.now() - cached.cachedAt > VIDEO_CACHE_TTL) {
    videoCache.delete(videoId)
    return null
  }

  return cached
}

function setCachedVideo(videoId: string, mediaDefinitions: CachedMediaDefinition[], winnerProxyUrl: string): void {
  // Evict oldest entries if cache is full
  if (videoCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = videoCache.keys().next().value
    if (oldestKey) videoCache.delete(oldestKey)
  }

  videoCache.set(videoId, {
    mediaDefinitions,
    winnerProxyUrl,
    cachedAt: Date.now()
  })
}

// In-memory cache for final m3u8 response (10 minute TTL - VOD content doesn't change)
const M3U8_CACHE_TTL = 10 * 60 * 1000 // 10 minutes
const MAX_M3U8_CACHE_SIZE = 500

interface CachedM3u8 {
  content: string
  cachedAt: number
}

const m3u8Cache = new Map<string, CachedM3u8>()

function getCachedM3u8(cacheKey: string): string | null {
  const cached = m3u8Cache.get(cacheKey)
  if (!cached) return null

  if (Date.now() - cached.cachedAt > M3U8_CACHE_TTL) {
    m3u8Cache.delete(cacheKey)
    return null
  }

  return cached.content
}

function setCachedM3u8(cacheKey: string, content: string): void {
  if (m3u8Cache.size >= MAX_M3U8_CACHE_SIZE) {
    const oldestKey = m3u8Cache.keys().next().value
    if (oldestKey) m3u8Cache.delete(oldestKey)
  }

  m3u8Cache.set(cacheKey, { content, cachedAt: Date.now() })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestStart = Date.now()
  const { id } = await params

  try {
    const quality = request.nextUrl.searchParams.get('q') || '720'

    if (!id || id.trim() === '') {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      )
    }

    // Allow cache bypass for debugging
    const fresh = request.nextUrl.searchParams.get('fresh') === '1'
    if (fresh) {
      videoCache.delete(id)
      m3u8Cache.delete(`${id}:${quality}`)
      console.log(`[Stream API] Cache cleared for video ${id}`)
    }

    // Check m3u8 response cache FIRST (before domain check to avoid DB hit on hot path)
    const m3u8CacheKey = `${id}:${quality}`
    const cachedM3u8 = getCachedM3u8(m3u8CacheKey)
    if (cachedM3u8) {
      console.log(`[Stream API] ✓ M3U8 cache hit for video ${id}`)
      return new Response(cachedM3u8, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'public, max-age=600',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // Cache miss — now check domain access (requires DB query)
    const domainCheck = await checkAndLogDomain(request, `/api/watch/${id}/stream`, 'GET')
    if (!domainCheck.allowed) {
      return domainCheck.response
    }

    // Check video metadata cache
    const cached = getCachedVideo(id)
    let mediaDefinitions: CachedMediaDefinition[]
    let winnerProxyUrl: string | null = null

    if (cached) {
      console.log(`[Stream API] ✓ Cache hit for video ${id}`)
      mediaDefinitions = cached.mediaDefinitions
      winnerProxyUrl = cached.winnerProxyUrl || null
    } else {
      // Get 3 unique proxies for racing (health-aware selection)
      const proxyAttempts = getProxiesForRacing(3)

      if (proxyAttempts.length === 0) {
        domainCheck.logRequest(500, Date.now() - requestStart).catch(() => {})
        console.error('[Stream API] No proxies available')
        throw new Error('No proxies available')
      }

      // Create racing promises - track which proxy wins
      const racePromises = proxyAttempts.map(async (proxyInfo) => {
        const pornhub = new PornHub()
        pornhub.setAgent(proxyInfo.agent)

        const startTime = Date.now()
        try {
          const response = await pornhub.video(id)
          const duration = Date.now() - startTime

          // Check for soft blocking
          if (!response.mediaDefinitions || response.mediaDefinitions.length < 1) {
            console.warn(`[Stream API] Proxy ${proxyInfo.proxyUrl} returned empty media definitions (${duration}ms)`)
            throw new Error('No media definitions')
          }

          console.log(`[Stream API] ✓ Success with proxy ${proxyInfo.proxyUrl} (${duration}ms, ${response.mediaDefinitions.length} qualities)`)
          // Return response with proxyId for health reporting
          return { response, proxyId: proxyInfo.proxyId }
        } catch (error: unknown) {
          const duration = Date.now() - startTime
          console.error(`[Stream API] Proxy ${proxyInfo.proxyUrl} failed (${duration}ms):`, error instanceof Error ? error.message : error)
          // Attach proxyId to error for failure reporting
          const err = new Error(error instanceof Error ? error.message : 'Unknown error')
          ;(err as Error & { proxyId: string }).proxyId = proxyInfo.proxyId
          throw err
        }
      })

      // Use Promise.any to get first successful response
      let videoInfo
      let winnerProxyId: string | null = null
      try {
        const result = await Promise.any(racePromises)
        videoInfo = result.response
        winnerProxyId = result.proxyId
        // Report success for the winning proxy
        reportProxySuccess(winnerProxyId)
      } catch (aggregateError) {
        // All proxies failed - report failure for all
        if (aggregateError instanceof AggregateError) {
          for (const err of aggregateError.errors) {
            const proxyId = (err as Error & { proxyId?: string }).proxyId
            if (proxyId) {
              reportProxyFailure(proxyId)
            }
          }
        }
        domainCheck.logRequest(500, Date.now() - requestStart).catch(() => {})
        console.error('[Stream API] ❌ All proxy attempts failed')
        throw new Error('Failed to fetch video information')
      }

      // Cache the result
      mediaDefinitions = videoInfo.mediaDefinitions
      winnerProxyUrl = winnerProxyId!
      setCachedVideo(id, mediaDefinitions, winnerProxyUrl)
      console.log(`[Stream API] Cached video ${id} (${mediaDefinitions.length} qualities)`)
    }

    // Quality priority: 720p -> 480p -> 240p
    const qualityPriority = ['720', '480', '240']
    const availableQualities = mediaDefinitions.map(md => md.quality).join(', ')

    let mediaDefinition = null
    let selectedQuality = null

    for (const q of qualityPriority) {
      mediaDefinition = mediaDefinitions.find(
        (md) => md.quality.toString() === q
      )
      if (mediaDefinition) {
        selectedQuality = q
        break
      }
    }

    if (mediaDefinition && selectedQuality !== quality) {
      console.log(`[Stream API] Quality ${quality}p not available, using ${selectedQuality}p instead. Available: ${availableQualities}`)
    }

    if (!mediaDefinition) {
      domainCheck.logRequest(404, Date.now() - requestStart).catch(() => {})
      console.warn(`[Stream API] No qualities available for video ${id}. Available: ${availableQualities}`)
      return NextResponse.json(
        { error: 'No video qualities available' },
        { status: 404 }
      )
    }

    const originalM3u8Url = mediaDefinition.videoUrl
    console.log(`[Stream API] Fetching m3u8 playlist via ${winnerProxyUrl ? 'proxy' : 'direct'}: ${originalM3u8Url}`)

    let originalM3u8: string
    if (winnerProxyUrl) {
      const m3u8Result = await fetchViaProxyAgent(originalM3u8Url, winnerProxyUrl)
      if (m3u8Result.status !== 200) {
        console.error(`[Stream API] Failed to fetch m3u8 via proxy: ${m3u8Result.status}`)
        throw new Error(`Failed to fetch m3u8: ${m3u8Result.status}`)
      }
      originalM3u8 = m3u8Result.body
    } else {
      const m3u8Response = await fetch(originalM3u8Url)
      if (!m3u8Response.ok) {
        throw new Error(`Failed to fetch m3u8: ${m3u8Response.status}`)
      }
      originalM3u8 = await m3u8Response.text()
    }
    console.log(`[Stream API] M3u8 playlist fetched successfully (${originalM3u8.length} bytes)`)

    if (isMasterPlaylist(originalM3u8)) {
      console.log('[Stream API] Detected master playlist, extracting variant URL...')
      const variantUrl = extractFirstVariantUrl(originalM3u8, originalM3u8Url)

      if (!variantUrl) {
        console.error('[Stream API] Could not extract variant playlist URL from master playlist')
        throw new Error('Could not extract variant playlist URL')
      }

      console.log(`[Stream API] Fetching variant playlist via ${winnerProxyUrl ? 'proxy' : 'direct'}: ${variantUrl}`)
      let variantM3u8: string
      if (winnerProxyUrl) {
        const variantResult = await fetchViaProxyAgent(variantUrl, winnerProxyUrl)
        if (variantResult.status !== 200) {
          console.error(`[Stream API] Failed to fetch variant via proxy: ${variantResult.status}`)
          throw new Error(`Failed to fetch variant playlist: ${variantResult.status}`)
        }
        variantM3u8 = variantResult.body
      } else {
        const variantResponse = await fetch(variantUrl)
        if (!variantResponse.ok) {
          throw new Error(`Failed to fetch variant playlist: ${variantResponse.status}`)
        }
        variantM3u8 = await variantResponse.text()
      }
      console.log(`[Stream API] Variant playlist fetched (${variantM3u8.length} bytes), injecting ads...`)
      const processed = await processM3u8({
        m3u8Content: variantM3u8,
        baseUrl: variantUrl,
        videoId: id,
        segmentProxyMode: 'full',
      })
      const modifiedM3u8 = processed.content

      // Cache the response
      setCachedM3u8(m3u8CacheKey, modifiedM3u8)

      // Non-blocking logging
      domainCheck.logRequest(200, Date.now() - requestStart).catch(() => {})
      console.log(`[Stream API] ✓ Stream generated successfully for video ${id} (quality: ${quality}p, duration: ${Date.now() - requestStart}ms)`)

      return new Response(modifiedM3u8, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'public, max-age=600',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    console.log('[Stream API] Standard playlist detected, injecting ads...')
    const processed = await processM3u8({
      m3u8Content: originalM3u8,
      baseUrl: originalM3u8Url,
      videoId: id,
      segmentProxyMode: 'cors',
    })
    const modifiedM3u8 = processed.content

    // Cache the response
    setCachedM3u8(m3u8CacheKey, modifiedM3u8)

    // Non-blocking logging
    domainCheck.logRequest(200, Date.now() - requestStart).catch(() => {})
    console.log(`[Stream API] ✓ Stream generated successfully for video ${id} (quality: ${quality}p, duration: ${Date.now() - requestStart}ms)`)

    return new Response(modifiedM3u8, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=600',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (error) {
    console.error('[Stream API] ❌ Failed to generate stream:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'Failed to generate stream' },
      { status: 500 }
    )
  }
}
