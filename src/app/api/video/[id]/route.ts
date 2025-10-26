import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { checkAndLogDomain } from '@/lib/domain-middleware'

export const revalidate = 7200 // 2 hours

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestStart = Date.now()

  try {
    const { id } = await params

    // Check domain access
    const domainCheck = await checkAndLogDomain(request, `/api/video/${id}`, 'GET')
    if (!domainCheck.allowed) {
      return domainCheck.response
    }

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

        break
      }


      pornhub.setAgent(proxyInfo.agent)

      const startTime = Date.now()
      try {
        const response = await pornhub.video(id)

        const duration = Date.now() - startTime

        // Check for soft blocking (missing media definitions)
        if (!response.mediaDefinitions || response.mediaDefinitions.length < 1) {

        } else {

          videoInfo = response
        }
      } catch (error: unknown) {
        const duration = Date.now() - startTime

      }

      retries--
      attemptNum++
    }

    if (!videoInfo || !videoInfo.mediaDefinitions || videoInfo.mediaDefinitions.length < 1) {
      await domainCheck.logRequest(500, Date.now() - requestStart)
      throw new Error('Failed to fetch video information')
    }

    // Log successful request
    await domainCheck.logRequest(200, Date.now() - requestStart)

    // Return original video info without any URL modifications
    return NextResponse.json(videoInfo, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=7200'
      }
    })

  } catch (error) {

    return NextResponse.json(
      { error: 'Failed to fetch video information' },
      { status: 500 }
    )
  }
}