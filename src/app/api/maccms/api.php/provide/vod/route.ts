import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

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

// Helper function to format date
function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').split('.')[0]
}

// Define categories
const categories: MaccmsClass[] = [
  { type_id: 1, type_name: 'Amateur' },
  { type_id: 2, type_name: 'Anal' },
  { type_id: 3, type_name: 'Asian' },
  { type_id: 4, type_name: 'BBW' },
  { type_id: 5, type_name: 'Big Ass' },
  { type_id: 6, type_name: 'Big Tits' },
  { type_id: 7, type_name: 'Blonde' },
  { type_id: 8, type_name: 'Blowjob' },
  { type_id: 9, type_name: 'Brunette' },
  { type_id: 10, type_name: 'Creampie' },
  { type_id: 11, type_name: 'Cumshot' },
  { type_id: 12, type_name: 'Ebony' },
  { type_id: 13, type_name: 'Hardcore' },
  { type_id: 14, type_name: 'Hentai' },
  { type_id: 15, type_name: 'Latina' },
  { type_id: 16, type_name: 'Lesbian' },
  { type_id: 17, type_name: 'MILF' },
  { type_id: 18, type_name: 'POV' },
  { type_id: 19, type_name: 'Teen' },
  { type_id: 20, type_name: 'Threesome' },
]

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
    xml += `      <pic_thumb>${wrapCDATA(video.vod_pic)}</pic_thumb>\n`
    xml += `      <pic_slide>${wrapCDATA(video.vod_pic)}</pic_slide>\n`
    xml += `      <pic_screenshot>${wrapCDATA(video.vod_pic)}</pic_screenshot>\n`
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

    const pageSize = 20
    const skip = (params.pg - 1) * pageSize

    let videos: MaccmsVideo[] = []
    let totalCount = 0

    if (params.ac === 'detail' && params.ids) {
      // Fetch specific videos by IDs
      const videoIds = params.ids.split(',').filter(id => id.trim())

      const dbVideos = await prisma.video.findMany({
        where: {
          vodId: {
            in: videoIds,
          },
        },
      })

      videos = dbVideos.map(v => ({
        vod_id: v.vodId,
        vod_name: v.vodName,
        type_id: v.typeId,
        type_name: v.typeName,
        vod_en: v.vodEn || '',
        vod_time: formatDate(v.vodTime),
        vod_remarks: v.vodRemarks || '',
        vod_play_from: v.vodPlayFrom,
        vod_pic: v.vodPic || '',
        vod_area: v.vodArea || '',
        vod_lang: v.vodLang || '',
        vod_year: v.vodYear || '',
        vod_actor: v.vodActor || '',
        vod_director: v.vodDirector || '',
        vod_content: v.vodContent || '',
        vod_play_url: v.vodPlayUrl,
      }))

      totalCount = videos.length

    } else if (params.ac === 'list') {
      // Build where clause
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {}

      // Category filter
      if (params.t) {
        const typeId = parseInt(params.t)
        if (!isNaN(typeId)) {
          where.typeId = typeId
        } else {
          // Search by category name
          where.typeName = {
            contains: params.t,
          }
        }
      }

      // Keyword search
      if (params.wd) {
        where.OR = [
          { vodName: { contains: params.wd } },
          { vodContent: { contains: params.wd } },
          { vodActor: { contains: params.wd } },
        ]
      }

      // Recent hours filter
      if (params.h) {
        const hoursAgo = new Date(Date.now() - params.h * 60 * 60 * 1000)
        where.vodTime = {
          gte: hoursAgo,
        }
      }

      // Fetch videos from database
      const [dbVideos, total] = await Promise.all([
        prisma.video.findMany({
          where,
          orderBy: {
            vodTime: 'desc',
          },
          skip,
          take: pageSize,
        }),
        prisma.video.count({ where }),
      ])

      videos = dbVideos.map(v => ({
        vod_id: v.vodId,
        vod_name: v.vodName,
        type_id: v.typeId,
        type_name: v.typeName,
        vod_en: v.vodEn || '',
        vod_time: formatDate(v.vodTime),
        vod_remarks: v.vodRemarks || '',
        vod_play_from: v.vodPlayFrom,
        vod_pic: v.vodPic || '',
        vod_area: v.vodArea || '',
        vod_lang: v.vodLang || '',
        vod_year: v.vodYear || '',
        vod_actor: v.vodActor || '',
        vod_director: v.vodDirector || '',
        vod_content: v.vodContent || '',
        vod_play_url: v.vodPlayUrl,
      }))

      totalCount = total
    }

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
      list: videos,
      class: categories,
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
        error: error.issues,
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
