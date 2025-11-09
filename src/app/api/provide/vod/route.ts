import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  DATABASE_TO_CONSOLIDATED,
  CONSOLIDATED_CATEGORIES,
  CONSOLIDATED_TYPE_IDS,
  CONSOLIDATED_TO_CHINESE,
  getVariantsForConsolidated,
} from '@/lib/maccms-mappings'

export const revalidate = 7200 // 2 hours

// Type definitions for Maccms response format
interface MaccmsVideo {
  vod_id: string
  type_id: number
  type_id_1: number
  group_id: number
  vod_name: string
  vod_sub: string
  vod_en: string
  vod_status: number
  vod_letter: string
  vod_color: string
  vod_tag: string
  vod_class: string
  vod_pic: string
  vod_pic_thumb: string
  vod_pic_slide: string
  vod_pic_screenshot: string | null
  vod_actor: string
  vod_director: string
  vod_writer: string
  vod_behind: string
  vod_blurb: string
  vod_remarks: string
  vod_pubdate: string
  vod_total: number
  vod_serial: string
  vod_tv: string
  vod_weekday: string
  vod_area: string
  vod_lang: string
  vod_year: string
  vod_version: string
  vod_state: string
  vod_author: string
  vod_jumpurl: string
  vod_tpl: string
  vod_tpl_play: string
  vod_tpl_down: string
  vod_isend: number
  vod_lock: number
  vod_level: number
  vod_copyright: number
  vod_points: number
  vod_points_play: number
  vod_points_down: number
  vod_hits: number
  vod_hits_day: number
  vod_hits_week: number
  vod_hits_month: number
  vod_duration: string
  vod_up: number
  vod_down: number
  vod_score: string
  vod_score_all: number
  vod_score_num: number
  vod_time: string
  vod_time_add: number
  vod_time_hits: number
  vod_time_make: number
  vod_trysee: number
  vod_douban_id: number
  vod_douban_score: string
  vod_reurl: string
  vod_rel_vod: string
  vod_rel_art: string
  vod_pwd: string
  vod_pwd_url: string
  vod_pwd_play: string
  vod_pwd_play_url: string
  vod_pwd_down: string
  vod_pwd_down_url: string
  vod_content: string
  vod_play_from: string
  vod_play_server: string
  vod_play_note: string
  vod_play_url: string
  vod_down_from: string
  vod_down_server: string
  vod_down_note: string
  vod_down_url: string
  vod_plot: number
  vod_plot_name: string
  vod_plot_detail: string
  type_name: string
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
  ac: z.enum(['list', 'detail', 'videolist']).transform(val => val === 'videolist' ? 'list' : val),
  t: z.string().optional(),
  pg: z.coerce.number().min(1).default(1).catch(1),
  wd: z.string().optional(),
  h: z.coerce.number().optional().catch(undefined),
  ids: z.string().optional(),
  at: z.enum(['xml', '']).optional().default(''),
})

// Helper function to format date
function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').split('.')[0]
}

// Helper to strip emojis and special unicode characters (failsafe for MACCMS latin1 encoding)
function stripEmojis(str: string): string {
  if (!str) return ''
  // Remove emojis and other problematic unicode characters
  return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F100}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/gu, '')
    .trim()
}

// Build consolidated MACCMS categories from the mapping
function buildMaccmsCategories(): MaccmsClass[] {
  return CONSOLIDATED_CATEGORIES.map(cat => ({
    type_id: CONSOLIDATED_TYPE_IDS[cat],
    type_name: CONSOLIDATED_TO_CHINESE[cat],
  }))
}

const MACCMS_CATEGORIES = buildMaccmsCategories()

/**
 * Get the MACCMS type_id for a database category name
 * Maps from database category (e.g., "Amateur Gay") to consolidated category (e.g., "gay") to type_id (e.g., 1)
 */
function getTypeIdForDatabaseCategory(dbCategoryName: string): number {
  const normalized = dbCategoryName.toLowerCase().trim()
  const consolidated = DATABASE_TO_CONSOLIDATED[normalized]

  if (consolidated) {
    return CONSOLIDATED_TYPE_IDS[consolidated] || 12 // Default to 'niche'
  }

  return 12 // Default to 'niche' if not found
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
    xml += `      <class>${wrapCDATA(video.vod_class)}</class>\n`
    xml += `      <pic>${wrapCDATA(video.vod_pic)}</pic>\n`
    xml += `      <pic_thumb>${wrapCDATA(video.vod_pic_thumb || video.vod_pic)}</pic_thumb>\n`
    xml += `      <pic_slide>${wrapCDATA(video.vod_pic_slide || video.vod_pic)}</pic_slide>\n`
    xml += `      <pic_screenshot>${wrapCDATA(video.vod_pic_screenshot || video.vod_pic)}</pic_screenshot>\n`
    xml += `      <lang>${escapeXml(video.vod_lang)}</lang>\n`
    xml += `      <area>${escapeXml(video.vod_area)}</area>\n`
    xml += `      <year>${escapeXml(video.vod_year)}</year>\n`
    xml += `      <state>${escapeXml(video.vod_remarks)}</state>\n`
    xml += `      <note>${escapeXml(video.vod_remarks)}</note>\n`
    // Strip actor and director in XML to prevent MACCMS blend logic false matches
    xml += `      <actor>${wrapCDATA('')}</actor>\n`
    xml += `      <director>${wrapCDATA('')}</director>\n`
    xml += `      <hit>${video.vod_hits}</hit>\n`
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

export async function GET(_request: NextRequest) {
  const requestStart = Date.now()
  try {
    const { searchParams } = new URL(_request.url)

    // Helper to normalize empty query params
    const getParam = (key: string) => {
      const val = searchParams.get(key)
      return val === '' || val === null ? undefined : val
    }

    // Parse and validate query parameters
    const params = querySchema.parse({
      ac: getParam('ac'),
      t: getParam('t'),
      pg: getParam('pg'),
      wd: getParam('wd'),
      h: getParam('h'),
      ids: getParam('ids'),
      at: getParam('at') || '',
    })

    console.log(`[MacCMS API] ${params.ac === 'detail' ? 'Detail' : 'List'} request - Page: ${params.pg}${params.t ? `, Type: ${params.t}` : ''}${params.wd ? `, Search: ${params.wd}` : ''}${params.ids ? `, IDs: ${params.ids}` : ''}`)

    const pageSize = 100
    const skip = (params.pg - 1) * pageSize

    let videos: MaccmsVideo[] = []
    let totalCount = 0

    // If ids parameter is provided, fetch only those specific videos (regardless of ac value)
    if (params.ids) {
      // Fetch specific videos by IDs
      const videoIds = params.ids.split(',').filter(id => id.trim())

      const dbVideos = await prisma.video.findMany({
        where: {
          vodId: {
            in: videoIds,
          },
        },
      })

      // Map videos with consolidated typeIds
      videos = dbVideos.map(v => {
        const typeId = getTypeIdForDatabaseCategory(v.typeName)
        // Sanitize all text fields to remove emojis (failsafe for MACCMS latin1 encoding)
        const cleanName = stripEmojis(v.vodName)
        const cleanActor = stripEmojis(v.vodActor || '')
        const cleanRemarks = stripEmojis(v.vodRemarks || '')
        const cleanContent = stripEmojis(v.vodContent || '')

        return {
          vod_id: v.vodId,
          type_id: typeId,
          type_id_1: 1,
          group_id: 0,
          vod_name: cleanName,
          vod_sub: '',
          vod_en: v.vodEn || '',
          vod_status: 1,
          vod_letter: (cleanName.charAt(0) || '').toUpperCase(),
          vod_color: '',
          vod_tag: '',
          vod_class: (v.vodClass || CONSOLIDATED_TO_CHINESE[DATABASE_TO_CONSOLIDATED[v.typeName.toLowerCase().trim()] || 'niche'] || '').split(',')[0]?.trim() || '',
          vod_pic: v.vodPic || '',
          vod_pic_thumb: '',
          vod_pic_slide: '',
          vod_pic_screenshot: '',
          // Strip actor and director to prevent MACCMS blend logic false matches
          // These fields are stored in our database but not sent to MACCMS for collection
          vod_actor: '',
          vod_director: '',
          vod_writer: '',
          vod_behind: '',
          vod_blurb: cleanContent,
          vod_remarks: cleanRemarks,
          vod_pubdate: '',
          vod_total: 0,
          vod_serial: '0',
          vod_tv: '',
          vod_weekday: '',
          vod_area: v.vodArea || '',
          vod_lang: v.vodLang || '',
          vod_year: v.vodYear || '',
          vod_version: '',
          vod_state: '',
          vod_author: '',
          vod_jumpurl: '',
          vod_tpl: '',
          vod_tpl_play: '',
          vod_tpl_down: '',
          vod_isend: 1,
          vod_lock: 0,
          vod_level: 0,
          vod_copyright: 0,
          vod_points: 0,
          vod_points_play: 0,
          vod_points_down: 0,
          vod_hits: v.views,
          vod_hits_day: 0,
          vod_hits_week: 0,
          vod_hits_month: 0,
          vod_duration: v.duration ? `${Math.floor(v.duration / 60)}:${(v.duration % 60).toString().padStart(2, '0')}` : '',
          vod_up: 0,
          vod_down: 0,
          vod_score: '0.0',
          vod_score_all: 0,
          vod_score_num: 0,
          vod_time: formatDate(v.vodTime),
          vod_time_add: Math.floor(v.createdAt.getTime() / 1000),
          vod_time_hits: Math.floor(v.updatedAt.getTime() / 1000),
          vod_time_make: 0,
          vod_trysee: 0,
          vod_douban_id: 0,
          vod_douban_score: '0.0',
          vod_reurl: '',
          vod_rel_vod: '',
          vod_rel_art: '',
          vod_pwd: '',
          vod_pwd_url: '',
          vod_pwd_play: '',
          vod_pwd_play_url: '',
          vod_pwd_down: '',
          vod_pwd_down_url: '',
          vod_content: cleanContent,
          vod_play_from: v.vodPlayFrom,
          vod_play_server: '',
          vod_play_note: '',
          vod_play_url: v.vodPlayUrl,
          dt: v.vodPlayFrom,
          vod_down_from: '',
          vod_down_server: '',
          vod_down_note: '',
          vod_down_url: '',
          vod_plot: 0,
          vod_plot_name: '',
          vod_plot_detail: '',
          type_name: CONSOLIDATED_TO_CHINESE[DATABASE_TO_CONSOLIDATED[v.typeName.toLowerCase().trim()] || 'niche'] || '',
        }
      })

      totalCount = videos.length

    } else if (params.ac === 'list') {
      // Build where clause
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = {}

      // Category filter
      if (params.t) {
        const typeId = parseInt(params.t)
        if (!isNaN(typeId)) {
          // Find which consolidated category this type_id corresponds to
          const consolidatedCategory = Object.entries(CONSOLIDATED_TYPE_IDS).find(
            ([, id]) => id === typeId
          )?.[0]

          if (consolidatedCategory) {
            // Get all database category names that map to this consolidated category
            const allVariants = getVariantsForConsolidated(consolidatedCategory)

            // Query for all consolidated category variants
            where.typeName = {
              in: allVariants
            }
          } else {
            // Fallback: try to find by exact typeId (for custom entries)
            where.typeId = typeId
          }
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

      // Map videos with consolidated typeIds
      videos = dbVideos.map(v => {
        const typeId = getTypeIdForDatabaseCategory(v.typeName)
        // Sanitize all text fields to remove emojis (failsafe for MACCMS latin1 encoding)
        const cleanName = stripEmojis(v.vodName)
        const cleanActor = stripEmojis(v.vodActor || '')
        const cleanRemarks = stripEmojis(v.vodRemarks || '')
        const cleanContent = stripEmojis(v.vodContent || '')

        return {
          vod_id: v.vodId,
          type_id: typeId,
          type_id_1: 1,
          group_id: 0,
          vod_name: cleanName,
          vod_sub: '',
          vod_en: v.vodEn || '',
          vod_status: 1,
          vod_letter: (cleanName.charAt(0) || '').toUpperCase(),
          vod_color: '',
          vod_tag: '',
          vod_class: (v.vodClass || CONSOLIDATED_TO_CHINESE[DATABASE_TO_CONSOLIDATED[v.typeName.toLowerCase().trim()] || 'niche'] || '').split(',')[0]?.trim() || '',
          vod_pic: v.vodPic || '',
          vod_pic_thumb: '',
          vod_pic_slide: '',
          vod_pic_screenshot: '',
          // Strip actor and director to prevent MACCMS blend logic false matches
          // These fields are stored in our database but not sent to MACCMS for collection
          vod_actor: '',
          vod_director: '',
          vod_writer: '',
          vod_behind: '',
          vod_blurb: cleanContent,
          vod_remarks: cleanRemarks,
          vod_pubdate: '',
          vod_total: 0,
          vod_serial: '0',
          vod_tv: '',
          vod_weekday: '',
          vod_area: v.vodArea || '',
          vod_lang: v.vodLang || '',
          vod_year: v.vodYear || '',
          vod_version: '',
          vod_state: '',
          vod_author: '',
          vod_jumpurl: '',
          vod_tpl: '',
          vod_tpl_play: '',
          vod_tpl_down: '',
          vod_isend: 1,
          vod_lock: 0,
          vod_level: 0,
          vod_copyright: 0,
          vod_points: 0,
          vod_points_play: 0,
          vod_points_down: 0,
          vod_hits: v.views,
          vod_hits_day: 0,
          vod_hits_week: 0,
          vod_hits_month: 0,
          vod_duration: v.duration ? `${Math.floor(v.duration / 60)}:${(v.duration % 60).toString().padStart(2, '0')}` : '',
          vod_up: 0,
          vod_down: 0,
          vod_score: '0.0',
          vod_score_all: 0,
          vod_score_num: 0,
          vod_time: formatDate(v.vodTime),
          vod_time_add: Math.floor(v.createdAt.getTime() / 1000),
          vod_time_hits: Math.floor(v.updatedAt.getTime() / 1000),
          vod_time_make: 0,
          vod_trysee: 0,
          vod_douban_id: 0,
          vod_douban_score: '0.0',
          vod_reurl: '',
          vod_rel_vod: '',
          vod_rel_art: '',
          vod_pwd: '',
          vod_pwd_url: '',
          vod_pwd_play: '',
          vod_pwd_play_url: '',
          vod_pwd_down: '',
          vod_pwd_down_url: '',
          vod_content: cleanContent,
          vod_play_from: v.vodPlayFrom,
          vod_play_server: '',
          vod_play_note: '',
          vod_play_url: v.vodPlayUrl,
          dt: v.vodPlayFrom,
          vod_down_from: '',
          vod_down_server: '',
          vod_down_note: '',
          vod_down_url: '',
          vod_plot: 0,
          vod_plot_name: '',
          vod_plot_detail: '',
          type_name: CONSOLIDATED_TO_CHINESE[DATABASE_TO_CONSOLIDATED[v.typeName.toLowerCase().trim()] || 'niche'] || '',
        }
      })

      totalCount = total
    }

    // Calculate pagination
    const pageCount = Math.ceil(totalCount / pageSize)

    // Get consolidated categories
    const categories = MACCMS_CATEGORIES

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
    const duration = Date.now() - requestStart
    console.log(`[MacCMS API] Success - Returned ${videos.length} videos (format: ${params.at === 'xml' ? 'XML' : 'JSON'}, duration: ${duration}ms)`)

    if (params.at === 'xml') {
      const xmlResponse = jsonToXml(response)
      return new NextResponse(xmlResponse, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
        },
      })
    } else {
      // For JSON, remove the class array only for ID-based lookups as maccms importers don't expect it
      // but keep it for list requests since they need category information
      if (params.ids) {
        const { class: _, ...jsonResponse } = response
        return NextResponse.json(jsonResponse, { status: 200 })
      } else {
        return NextResponse.json(response, { status: 200 })
      }
    }

  } catch (error) {
    const duration = Date.now() - requestStart
    console.error(`[MacCMS API] Request failed (${duration}ms):`, error instanceof Error ? error.message : error)


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
    }

    // Check if XML format was requested
    const searchParams = new URL(_request.url).searchParams
    if (searchParams.get('at') === 'xml') {
      const xmlError = `<?xml version="1.0" encoding="utf-8"?>
<rss version="1.0">
  <list page="1" pagecount="0" pagesize="100" recordcount="0">
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
export async function POST(_request: NextRequest) {
  // Some Maccms clients might use POST, redirect to GET
  return GET(_request)
}
