import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCategoryChineseName, getCanonicalCategory, getConsolidatedCategories } from '@/lib/category-mapping'

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

// All categories that exist in the database, grouped by their general category
// This ensures every video in the database is accessible through the MACCMS API
const MACCMS_CATEGORIES: MaccmsClass[] = [
  // === MAIN CATEGORIES ===
  { type_id: 1, type_name: '亚洲' },          // asian
  { type_id: 2, type_name: '三人行' },        // threesome
  { type_id: 3, type_name: '业余' },          // amateur
  { type_id: 6, type_name: '大码美女' },      // bbw
  { type_id: 8, type_name: '大奶' },          // big-tits
  { type_id: 9, type_name: '金发女' },        // blonde
  { type_id: 10, type_name: '恋物癖' },       // fetish
  { type_id: 13, type_name: '劲爆重口味' },   // hardcore
  { type_id: 14, type_name: '射精' },         // cumshot
  { type_id: 17, type_name: '异族' },         // interracial
  { type_id: 22, type_name: '自慰' },         // masturbation
  { type_id: 23, type_name: '玩具' },         // toys
  { type_id: 26, type_name: '拉丁' },         // latina
  { type_id: 27, type_name: '女同性恋' },     // lesbian
  { type_id: 28, type_name: '成熟' },         // mature
  { type_id: 32, type_name: '动漫' },         // hentai
  { type_id: 38, type_name: '高清' },         // hd-porn
  { type_id: 67, type_name: '粗暴性爱' },     // rough-sex
  { type_id: 68, type_name: '大学生' },       // college-18
  { type_id: 72, type_name: '双插' },         // double-penetration
  { type_id: 73, type_name: '女性喜爱' },     // popular-with-women
  { type_id: 76, type_name: '双性恋男' },     // bisexual-male
  { type_id: 81, type_name: '角色扮演' },     // cosplay
  { type_id: 83, type_name: '跨性别' },       // transgender
  { type_id: 89, type_name: '保姆' },         // babysitter
  { type_id: 92, type_name: '男性自慰' },     // solo-male
  { type_id: 94, type_name: '欧洲' },         // euro
  { type_id: 104, type_name: '虚拟现实' },    // vr
  { type_id: 105, type_name: '60帧' },        // 60fps
  { type_id: 131, type_name: '舔阴' },        // pussy-licking
  { type_id: 141, type_name: '幕后花絮' },    // behind-the-scenes
  { type_id: 181, type_name: '老少配' },      // old-young
  { type_id: 231, type_name: '描述视频' },    // described-video
  { type_id: 241, type_name: '角色扮演' },    // role-play (same as cosplay)
  { type_id: 444, type_name: '继家庭幻想' },  // step-fantasy
  { type_id: 482, type_name: '认证情侣' },    // verified-couples
  { type_id: 492, type_name: '女性自慰' },    // solo-female
  { type_id: 502, type_name: '女性高潮' },    // female-orgasm
  { type_id: 512, type_name: '肌肉男' },      // muscular-men
  { type_id: 542, type_name: '假阳具' },      // strap-on
  { type_id: 562, type_name: '纹身女' },      // tattooed-women
  { type_id: 572, type_name: '跨性别与女' },  // trans-with-girl
  { type_id: 582, type_name: '跨性别与男' },  // trans-with-guy
  { type_id: 602, type_name: '跨性别男' },    // trans-male
  { type_id: 612, type_name: '360度' },       // 360-vr
  { type_id: 622, type_name: '180度' },       // 180-vr
  { type_id: 632, type_name: '高清' },        // hd-porn (duplicate)
  { type_id: 722, type_name: '无码' },        // uncensored
  { type_id: 732, type_name: '字幕' },        // closed-captions
  { type_id: 111, type_name: '日本' },        // japanese (NEVER consolidate)
  { type_id: 115, type_name: '认证业余' },    // verified-amateurs
  { type_id: 138, type_name: '认证业余' },    // verified-amateurs (duplicate)
  { type_id: 139, type_name: '认证模特' },    // verified-models

  // === GAY CATEGORIES (all map to general gay) ===
  { type_id: 40, type_name: '同性恋' },       // gay (base)
  { type_id: 45, type_name: '同性恋' },       // gay variant
  { type_id: 48, type_name: '同性恋' },       // gay variant
  { type_id: 70, type_name: '同性恋' },       // gay variant
  { type_id: 77, type_name: '同性恋' },       // gay variant
  { type_id: 82, type_name: '同性恋' },       // gay variant
  { type_id: 84, type_name: '同性恋' },       // gay variant
  { type_id: 85, type_name: '同性恋' },       // gay variant
  { type_id: 107, type_name: '同性恋' },      // gay variant
  { type_id: 252, type_name: '同性恋' },      // gay variant
  { type_id: 262, type_name: '同性恋' },      // gay variant
  { type_id: 272, type_name: '同性恋' },      // gay variant
  { type_id: 312, type_name: '同性恋' },      // gay variant
  { type_id: 322, type_name: '同性恋' },      // gay variant
  { type_id: 332, type_name: '同性恋' },      // gay variant
  { type_id: 342, type_name: '同性恋' },      // gay variant
  { type_id: 352, type_name: '同性恋' },      // gay variant
  { type_id: 362, type_name: '同性恋' },      // gay variant
  { type_id: 372, type_name: '同性恋' },      // gay variant
  { type_id: 382, type_name: '同性恋' },      // gay variant
  { type_id: 392, type_name: '同性恋' },      // gay variant
  { type_id: 402, type_name: '同性恋' },      // gay variant
  { type_id: 412, type_name: '同性恋' },      // gay variant
  { type_id: 422, type_name: '同性恋' },      // gay variant
  { type_id: 552, type_name: '同性恋' },      // gay variant
  { type_id: 702, type_name: '同性恋' },      // gay variant
  { type_id: 731, type_name: '同性恋' },      // gay variant
  { type_id: 742, type_name: '同性恋' },      // gay variant
  { type_id: 901, type_name: '同性恋' },      // gay variant
  { type_id: 37, type_name: '18-25岁' },      // college-18
  { type_id: 79, type_name: '大学生' },       // college (duplicate)
  { type_id: 88, type_name: '学生' },         // school-student
  { type_id: 106, type_name: '虚拟现实' },    // vr (duplicate)
  { type_id: 9998, type_name: '中文' }        // chinese (NEVER consolidate)
]

// Map canonical category names to their MAIN type_id (for new videos consolidation)
const CANONICAL_TO_TYPE_ID: Record<string, number> = {
  'asian': 1,
  'threesome': 2,
  'amateur': 3,
  'bbw': 6,
  'big-tits': 8,
  'blonde': 9,
  'fetish': 10,
  'hardcore': 13,
  'cumshot': 14,
  'interracial': 17,
  'masturbation': 22,
  'toys': 23,
  'latina': 26,
  'lesbian': 27,
  'mature': 28,
  'hentai': 32,
  'hd-porn': 38,
  'rough-sex': 67,
  'college-18': 68,
  'double-penetration': 72,
  'popular-with-women': 73,
  'bisexual-male': 76,
  'cosplay': 81,
  'transgender': 83,
  'babysitter': 89,
  'solo-male': 92,
  'euro': 94,
  'vr': 104,
  '60fps': 105,
  'pussy-licking': 131,
  'behind-the-scenes': 141,
  'old-young': 181,
  'described-video': 231,
  'role-play': 241,
  'step-fantasy': 444,
  'verified-couples': 482,
  'solo-female': 492,
  'female-orgasm': 502,
  'muscular-men': 512,
  'strap-on': 542,
  'tattooed-women': 562,
  'trans-with-girl': 572,
  'trans-with-guy': 582,
  'trans-male': 602,
  '360-vr': 612,
  '180-vr': 622,
  'uncensored': 722,
  'closed-captions': 732,
  'gay': 40,
  'japanese': 111,
  'verified-amateurs': 115,
  'chinese': 9998
}

// Helper function to get hardcoded categories
function getCategories(): Promise<MaccmsClass[]> {
  return Promise.resolve(MACCMS_CATEGORIES)
}

// Helper function to get canonical typeId for a typeName
function getCanonicalTypeId(typeName: string): Promise<number> {
  const canonical = getCanonicalCategory(typeName)
  const typeId = CANONICAL_TO_TYPE_ID[canonical] || 0
  return Promise.resolve(typeId)
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
    xml += `      <actor>${wrapCDATA(video.vod_actor)}</actor>\n`
    xml += `      <director>${wrapCDATA(video.vod_director)}</director>\n`
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

export async function GET(request: NextRequest) {
  const requestStart = Date.now()
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

      // Map videos with canonical typeIds
      videos = await Promise.all(dbVideos.map(async v => {
        const typeId = await getCanonicalTypeId(v.typeName)
        return {
          vod_id: v.vodId,
          type_id: typeId,
          type_id_1: 1,
          group_id: 0,
          vod_name: v.vodName,
          vod_sub: '',
          vod_en: v.vodEn || '',
          vod_status: 1,
          vod_letter: (v.vodName.charAt(0) || '').toUpperCase(),
          vod_color: '',
          vod_tag: '',
          vod_class: (v.vodClass || getCategoryChineseName(v.typeName)).split(',')[0]?.trim() || '',
          vod_pic: v.vodPic || '',
          vod_pic_thumb: '',
          vod_pic_slide: '',
          vod_pic_screenshot: null,
          vod_actor: v.vodActor || '',
          vod_director: v.vodDirector || '',
          vod_writer: '',
          vod_behind: '',
          vod_blurb: v.vodContent || '',
          vod_remarks: v.vodRemarks || '',
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
          vod_content: v.vodContent || '',
          vod_play_from: v.vodPlayFrom,
          vod_play_server: 'no',
          vod_play_note: '',
          vod_play_url: v.vodPlayUrl,
          vod_down_from: '',
          vod_down_server: '',
          vod_down_note: '',
          vod_down_url: '',
          vod_plot: 0,
          vod_plot_name: '',
          vod_plot_detail: '',
          type_name: getCategoryChineseName(v.typeName),
        }
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
          // Find the category name for this typeId
          const categoryResult = await prisma.video.findFirst({
            where: { typeId },
            select: { typeName: true }
          })

          if (categoryResult) {
            const canonical = getCanonicalCategory(categoryResult.typeName)
            const allVariants = getConsolidatedCategories(canonical)

            // Query for all consolidated category variants
            where.typeName = {
              in: allVariants
            }
          } else {
            // Fallback to exact typeId if not found
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

      // Map videos with canonical typeIds
      videos = await Promise.all(dbVideos.map(async v => {
        const typeId = await getCanonicalTypeId(v.typeName)
        return {
          vod_id: v.vodId,
          type_id: typeId,
          type_id_1: 1,
          group_id: 0,
          vod_name: v.vodName,
          vod_sub: '',
          vod_en: v.vodEn || '',
          vod_status: 1,
          vod_letter: (v.vodName.charAt(0) || '').toUpperCase(),
          vod_color: '',
          vod_tag: '',
          vod_class: (v.vodClass || getCategoryChineseName(v.typeName)).split(',')[0]?.trim() || '',
          vod_pic: v.vodPic || '',
          vod_pic_thumb: '',
          vod_pic_slide: '',
          vod_pic_screenshot: null,
          vod_actor: v.vodActor || '',
          vod_director: v.vodDirector || '',
          vod_writer: '',
          vod_behind: '',
          vod_blurb: v.vodContent || '',
          vod_remarks: v.vodRemarks || '',
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
          vod_content: v.vodContent || '',
          vod_play_from: v.vodPlayFrom,
          vod_play_server: 'no',
          vod_play_note: '',
          vod_play_url: v.vodPlayUrl,
          vod_down_from: '',
          vod_down_server: '',
          vod_down_note: '',
          vod_down_url: '',
          vod_plot: 0,
          vod_plot_name: '',
          vod_plot_detail: '',
          type_name: getCategoryChineseName(v.typeName),
        }
      }))

      totalCount = total
    }

    // Calculate pagination
    const pageCount = Math.ceil(totalCount / pageSize)

    // Fetch categories from database
    const categories = await getCategories()

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
      return NextResponse.json(response, { status: 200 })
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
      class: [],
    }

    // Check if XML format was requested
    const searchParams = new URL(request.url).searchParams
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
export async function POST(request: NextRequest) {
  // Some Maccms clients might use POST, redirect to GET
  return GET(request)
}
