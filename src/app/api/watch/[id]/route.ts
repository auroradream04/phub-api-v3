import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Extract the id parameter from the route
    const { id } = await params

    // Validate that id is provided
    if (!id || id.trim() === '') {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      )
    }

    // Initialize PornHub client
    const pornhub = new PornHub()

    let videoInfo
    let retries = 3

    // Try without proxy first
    try {
      videoInfo = await pornhub.video(id)
    } catch (error) {
      console.error('[API] Request failed without proxy:', error instanceof Error ? error.message : 'Unknown error')
    }

    // If request failed, retry with random proxy (matching v2 logic)
    while ((videoInfo === undefined || videoInfo === null || !videoInfo.mediaDefinitions || videoInfo.mediaDefinitions.length < 1) && retries > 0) {
      const proxyAgent = getRandomProxy()

      if (!proxyAgent) {
        console.warn('[API] No proxies available. Cannot retry.')
        break
      }

      console.log(`[API] Retrying with proxy (${retries} retries remaining)...`)
      pornhub.setAgent(proxyAgent)

      try {
        videoInfo = await pornhub.video(id)
      } catch (error) {
        console.error('[API] Request failed with proxy:', error instanceof Error ? error.message : 'Unknown error')
      }

      retries--
    }

    // If still no valid data after all retries, throw error
    if (!videoInfo || !videoInfo.mediaDefinitions || videoInfo.mediaDefinitions.length < 1) {
      throw new Error('Failed to fetch video information after all retries')
    }

    // Get base URL for proxy URLs
    // Check multiple headers for HTTPS detection (production deployment compatibility)
    const host = request.headers.get('host') || 'localhost:4444'
    const xForwardedProto = request.headers.get('x-forwarded-proto')
    const xForwardedScheme = request.headers.get('x-forwarded-scheme')

    // Determine protocol: prefer forwarded headers, then check if host suggests HTTPS
    let protocol = xForwardedProto || xForwardedScheme
    if (!protocol) {
      // If no forwarded header, assume HTTPS for production domains
      protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https'
    }

    const baseUrl = `${protocol}://${host}`

    // Transform mediaDefinitions to use our stream endpoint
    // CORS proxy will be applied to the actual PornHub segment URLs in the stream route
    const transformedMediaDefinitions = videoInfo.mediaDefinitions.map((md) => ({
      ...md,
      originalUrl: md.videoUrl,
      videoUrl: `${baseUrl}/api/watch/${id}/stream?q=${md.quality}`,
    }))

    // Return the video info with transformed URLs
    return NextResponse.json({
      ...videoInfo,
      mediaDefinitions: transformedMediaDefinitions,
    }, { status: 200 })

  } catch (error) {
    // Handle errors gracefully
    console.error('[API] Error fetching video info:', error)

    // Return generic error message (don't expose internal errors)
    return NextResponse.json(
      { error: 'Failed to fetch video information' },
      { status: 500 }
    )
  }
}