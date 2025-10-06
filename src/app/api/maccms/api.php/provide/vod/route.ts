import { NextRequest, NextResponse } from 'next/server'
import { PornHub } from 'pornhub.js'
import { getRandomProxy } from '@/lib/proxy'
import { z } from 'zod'

// Type definitions for Maccms response format
interface MaccmsVideo {
  vod_id: string
  vod_name: string
  type_id: number
  type_name: string
  vod_en: string
  vod_time: string
  vod_remarks: string
  vod_play_from: string
  vod_pic: string
  vod_area: string
  vod_lang: string
  vod_year: string
  vod_actor: string
  vod_director: string
  vod_content: string
  vod_play_url: string
}

interface MaccmsClass {
  type_id: number
  type_name: string
}

interface MaccmsJsonResponse {
  code: number
  msg: string
  page: number
  pagecount: number
  limit: string
  total: number
  list: MaccmsVideo[]
  class: MaccmsClass[]
}

// Validation schema for query parameters
const querySchema = z.object({
  ac: z.enum(['list', 'detail']),
  t: z.string().optional(),
  pg: z.coerce.number().min(1).default(1),
  wd: z.string().optional(),
  h: z.coerce.number().optional(),
  ids: z.string().optional(),
  at: z.enum(['xml', '']).optional().default(''),
})

// Helper function to format duration
function formatDuration(seconds?: number): string {
  if (!seconds) return 'HD'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

// Helper function to format date
function formatDate(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString().replace('T', ' ').split('.')[0]
  try {
    const date = new Date(dateStr)
    return date.toISOString().replace('T', ' ').split('.')[0]
  } catch {
    return new Date().toISOString().replace('T', ' ').split('.')[0]
  }
}

// Helper function to extract year from date
function extractYear(dateStr?: string): string {
  if (!dateStr) return new Date().getFullYear().toString()
  try {
    const date = new Date(dateStr)
    return date.getFullYear().toString()
  } catch {
    return new Date().getFullYear().toString()
  }
}

// Helper function to create slug from title
function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
}

// Helper function to map PornHub video to Maccms format
function mapToMaccmsVideo(video: any, baseUrl: string): MaccmsVideo {
  const vodId = video.video_id || video.key || video.id || 'unknown'
  const vodName = video.title || 'Untitled'
  const vodPic = video.thumb || video.default_thumb || video.preview || ''
  const vodTime = formatDate(video.publish_date || video.added || video.uploadDate)
  const vodYear = extractYear(video.publish_date || video.added || video.uploadDate)
  const vodRemarks = video.duration ? formatDuration(video.duration) : 'HD'
  const vodActor = video.pornstars?.join(',') || video.actors?.join(',') || ''
  const vodContent = video.tags?.join(', ') || video.categories?.join(', ') || ''
  const vodPlayUrl = `Full Video$${baseUrl}/api/watch/${vodId}/stream?q=720`

  return {
    vod_id: vodId,
    vod_name: vodName,
    type_id: 1,
    type_name: video.categories?.[0] || 'Adult',
    vod_en: createSlug(vodName),
    vod_time: vodTime,
    vod_remarks: vodRemarks,
    vod_play_from: 'YourAPI',
    vod_pic: vodPic,
    vod_area: 'US',
    vod_lang: 'en',
    vod_year: vodYear,
    vod_actor: vodActor,
    vod_director: '',
    vod_content: vodContent,
    vod_play_url: vodPlayUrl,
  }
}

// Helper function to convert JSON response to XML
function jsonToXml(response: MaccmsJsonResponse): string {
  const escapeXml = (str: string): string => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  const wrapCDATA = (str: string): string => {
    return `<![CDATA[${str}]]>`
  }

  let xml = '<?xml version="1.0" encoding="utf-8"?>\n'
  xml += '<rss version="1.0">\n'
  xml += `  <list page="${response.page}" pagecount="${response.pagecount}" pagesize="${response.limit}" recordcount="${response.total}">\n`

  for (const video of response.list) {
    xml += '    <video>\n'
    xml += `      <last>${escapeXml(video.vod_time)}</last>\n`
    xml += `      <id>${escapeXml(video.vod_id)}</id>\n`
    xml += `      <tid>${video.type_id}</tid>\n`
    xml += `      <name>${wrapCDATA(video.vod_name)}</name>\n`
    xml += `      <type>${escapeXml(video.type_name)}</type>\n`
    xml += `      <pic>${wrapCDATA(video.vod_pic)}</pic>\n`
    xml += `      <lang>${escapeXml(video.vod_lang)}</lang>\n`
    xml += `      <area>${escapeXml(video.vod_area)}</area>\n`
    xml += `      <year>${escapeXml(video.vod_year)}</year>\n`
    xml += `      <state>${escapeXml(video.vod_remarks)}</state>\n`
    xml += `      <note>${escapeXml(video.vod_remarks)}</note>\n`
    xml += `      <actor>${wrapCDATA(video.vod_actor)}</actor>\n`
    xml += `      <director>${wrapCDATA(video.vod_director)}</director>\n`
    xml += '      <dl>\n'
    xml += `        <dd flag="${escapeXml(video.vod_play_from)}">${wrapCDATA(video.vod_play_url)}</dd>\n`
    xml += '      </dl>\n'
    xml += `      <des>${wrapCDATA(video.vod_content)}</des>\n`
    xml += '    </video>\n'
  }

  xml += '  </list>\n'
  xml += '  <class>\n'

  for (const cls of response.class) {
    xml += `    <ty id="${cls.type_id}">${escapeXml(cls.type_name)}</ty>\n`
  }

  xml += '  </class>\n'
  xml += '</rss>'

  return xml
}

// Helper function to fetch videos with retry logic
async function fetchVideosWithRetry(
  pornhub: PornHub,
  fetchFunction: () => Promise<any>,
  maxRetries = 3
): Promise<any> {
  let result = null
  let retries = maxRetries

  // Try without proxy first
  try {
    result = await fetchFunction()
    if (result && (Array.isArray(result) ? result.length > 0 : result.results?.length > 0)) {
      return result
    }
  } catch (error) {
    console.error('[Maccms API] Request failed without proxy:', error instanceof Error ? error.message : 'Unknown error')
  }

  // Retry with proxy if needed
  while ((!result || (Array.isArray(result) ? result.length === 0 : result.results?.length === 0)) && retries > 0) {
    const proxyAgent = getRandomProxy()

    if (!proxyAgent) {
      console.warn('[Maccms API] No proxies available. Cannot retry.')
      break
    }

    console.log(`[Maccms API] Retrying with proxy (${retries} retries remaining)...`)
    pornhub.setAgent(proxyAgent)

    try {
      result = await fetchFunction()
      if (result && (Array.isArray(result) ? result.length > 0 : result.results?.length > 0)) {
        return result
      }
    } catch (error) {
      console.error('[Maccms API] Request failed with proxy:', error instanceof Error ? error.message : 'Unknown error')
    }

    retries--
  }

  return result
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Parse and validate query parameters
    const params = querySchema.parse({
      ac: searchParams.get('ac'),
      t: searchParams.get('t') || undefined,
      pg: searchParams.get('pg') || 1,
      wd: searchParams.get('wd') || undefined,
      h: searchParams.get('h') || undefined,
      ids: searchParams.get('ids') || undefined,
      at: searchParams.get('at') || '',
    })

    // Get base URL from environment
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:4444'

    // Initialize PornHub client
    const pornhub = new PornHub()

    // Prepare response data
    let videos: any[] = []
    let totalCount = 0
    const pageSize = 20

    if (params.ac === 'detail' && params.ids) {
      // Fetch specific videos by IDs
      const videoIds = params.ids.split(',').filter(id => id.trim())

      for (const videoId of videoIds) {
        try {
          const videoInfo = await fetchVideosWithRetry(
            pornhub,
            () => pornhub.video(videoId.trim())
          )

          if (videoInfo) {
            videos.push(videoInfo)
          }
        } catch (error) {
          console.error(`[Maccms API] Failed to fetch video ${videoId}:`, error)
        }
      }

      totalCount = videos.length

    } else if (params.ac === 'list') {
      // Fetch video list
      const options: any = {
        page: params.pg,
      }

      // Apply filters
      if (params.t) {
        options.category = params.t
      }

      if (params.h) {
        // Filter by recent hours (not directly supported by PornHub.js, so we'll use period)
        if (params.h <= 24) {
          options.period = 'daily'
        } else if (params.h <= 168) {
          options.period = 'weekly'
        } else if (params.h <= 720) {
          options.period = 'monthly'
        }
      }

      try {
        if (params.wd) {
          // Search videos
          const searchResult = await fetchVideosWithRetry(
            pornhub,
            () => pornhub.searchVideo(params.wd!, options)
          )

          if (searchResult) {
            videos = searchResult.results || []
            totalCount = searchResult.total || videos.length
          }
        } else {
          // Get video list
          const videoList = await fetchVideosWithRetry(
            pornhub,
            () => pornhub.videoList(options)
          )

          if (videoList) {
            videos = Array.isArray(videoList) ? videoList : (videoList.results || [])
            totalCount = videoList.total || videos.length * 10 // Estimate total
          }
        }
      } catch (error) {
        console.error('[Maccms API] Failed to fetch video list:', error)
        videos = []
        totalCount = 0
      }
    }

    // Map videos to Maccms format
    const mappedVideos = videos.map(video => mapToMaccmsVideo(video, baseUrl))

    // Calculate pagination
    const pageCount = Math.ceil(totalCount / pageSize)

    // Prepare response
    const response: MaccmsJsonResponse = {
      code: 1,
      msg: params.ac === 'detail' ? '数据详情' : '数据列表',
      page: params.pg,
      pagecount: pageCount,
      limit: pageSize.toString(),
      total: totalCount,
      list: mappedVideos.slice(0, pageSize), // Ensure we don't exceed page size
      class: [
        { type_id: 1, type_name: 'Adult' },
      ],
    }

    // Return response in requested format
    if (params.at === 'xml') {
      const xmlResponse = jsonToXml(response)
      return new NextResponse(xmlResponse, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
        },
      })
    } else {
      return NextResponse.json(response, { status: 200 })
    }

  } catch (error) {
    console.error('[Maccms API] Error:', error)

    // Handle validation errors
    if (error instanceof z.ZodError) {
      const errorResponse = {
        code: 0,
        msg: 'Invalid parameters',
        error: error.errors,
      }

      return NextResponse.json(errorResponse, { status: 400 })
    }

    // Generic error response
    const errorResponse = {
      code: 0,
      msg: 'Internal server error',
      list: [],
      class: [],
    }

    // Check if XML format was requested
    const searchParams = new URL(request.url).searchParams
    if (searchParams.get('at') === 'xml') {
      const xmlError = `<?xml version="1.0" encoding="utf-8"?>
<rss version="1.0">
  <list page="1" pagecount="0" pagesize="20" recordcount="0">
  </list>
  <class>
    <ty id="1">Adult</ty>
  </class>
</rss>`
      return new NextResponse(xmlError, {
        status: 500,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
        },
      })
    }

    return NextResponse.json(errorResponse, { status: 500 })
  }
}

// Support for alternate path patterns
export async function POST(request: NextRequest) {
  // Some Maccms clients might use POST, redirect to GET
  return GET(request)
}