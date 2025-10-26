import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCategoryChineseName, getCanonicalCategory, getConsolidatedCategories } from '@/lib/category-mapping'

export const revalidate = 7200 // 2 hours

// Type definitions for Maccms response format
interface MaccmsVideo {
  vod_id: string
  vod_name: string
  type_id: number
  type_name: string
  vod_class: string
  vod_en: string
  vod_time: string
  vod_remarks: string
  vod_play_from: string
  vod_pic: string
  vod_pic_thumb: string
  vod_pic_slide: string
  vod_pic_screenshot: string
  vod_area: string
  vod_lang: string
  vod_year: string
  vod_actor: string
  vod_director: string
  vod_content: string
  vod_play_url: string
  vod_hits: number
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

// Cache for categories (refreshed every hour)
let cachedCategories: MaccmsClass[] | null = null
let categoriesCacheTime = 0
const CATEGORIES_CACHE_TTL = 3600000 // 1 hour in ms

// Cache for typeId mapping (typeName → canonical typeId)
let cachedTypeIdMap: Map<string, number> | null = null

// Helper function to fetch categories from database
async function getCategories(): Promise<MaccmsClass[]> {
  const now = Date.now()

  // Return cached categories if still valid
  if (cachedCategories && (now - categoriesCacheTime) < CATEGORIES_CACHE_TTL) {
    return cachedCategories
  }

  // Fetch categories from database
  const dbCategories = await prisma.video.groupBy({
    by: ['typeId', 'typeName'],
    _count: { id: true },
    where: {
      typeName: { not: '' }
    },
    orderBy: {
      typeId: 'asc'
    }
  })

  // Group categories by their canonical name and merge counts
  // IMPORTANT: japanese and chinese must NEVER be consolidated
  const categoryMap = new Map<string, { typeId: number; typeName: string; count: number }>()
  const typeIdMap = new Map<string, number>() // Map: typeName (any variant) → canonical typeId

  for (const cat of dbCategories) {
    const normalized = cat.typeName.toLowerCase().trim()

    // Special handling: NEVER consolidate japanese or chinese
    let key: string
    if (normalized === 'japanese' || normalized === 'chinese') {
      key = normalized // Use original name as key
    } else {
      key = getCanonicalCategory(cat.typeName) // Use canonical for everything else
    }

    const chineseName = getCategoryChineseName(cat.typeName)

    if (categoryMap.has(key)) {
      // Add count to existing category
      const existing = categoryMap.get(key)!
      existing.count += cat._count.id
      // Map this typeName variant to the canonical typeId
      typeIdMap.set(normalized, existing.typeId)
    } else {
      // Create new category entry
      categoryMap.set(key, {
        typeId: cat.typeId,
        typeName: chineseName,
        count: cat._count.id
      })
      // Map this typeName to its own typeId (it's the canonical one)
      typeIdMap.set(normalized, cat.typeId)
    }
  }

  // Transform to MaccmsClass format
  const categories: MaccmsClass[] = Array.from(categoryMap.values()).map(cat => ({
    type_id: cat.typeId,
    type_name: cat.typeName
  }))

  // Update cache
  cachedCategories = categories
  cachedTypeIdMap = typeIdMap
  categoriesCacheTime = now

  return categories
}

// Helper function to get canonical typeId for a typeName
async function getCanonicalTypeId(typeName: string): Promise<number> {
  // Ensure categories are loaded
  if (!cachedTypeIdMap) {
    await getCategories()
  }

  const normalized = typeName.toLowerCase().trim()
  return cachedTypeIdMap?.get(normalized) || 0 // Return 0 if not found (shouldn't happen)
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

    const pageSize = 100
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

      // Map videos with canonical typeIds
      videos = await Promise.all(dbVideos.map(async v => ({
        vod_id: v.vodId,
        vod_name: v.vodName,
        type_id: await getCanonicalTypeId(v.typeName),
        type_name: getCategoryChineseName(v.typeName),
        vod_class: v.vodClass || getCategoryChineseName(v.typeName),
        vod_en: v.vodEn || '',
        vod_time: formatDate(v.vodTime),
        vod_remarks: v.vodRemarks || '',
        vod_play_from: v.vodPlayFrom,
        vod_pic: v.vodPic || '',
        vod_pic_thumb: v.vodPic || '',
        vod_pic_slide: v.vodPic || '',
        vod_pic_screenshot: v.vodPic || '',
        vod_area: v.vodArea || '',
        vod_lang: v.vodLang || '',
        vod_year: v.vodYear || '',
        vod_actor: v.vodActor || '',
        vod_director: v.vodDirector || '',
        vod_content: v.vodContent || '',
        vod_play_url: v.vodPlayUrl,
        vod_hits: v.views,
      })))

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
      videos = await Promise.all(dbVideos.map(async v => ({
        vod_id: v.vodId,
        vod_name: v.vodName,
        type_id: await getCanonicalTypeId(v.typeName),
        type_name: getCategoryChineseName(v.typeName),
        vod_class: v.vodClass || getCategoryChineseName(v.typeName),
        vod_en: v.vodEn || '',
        vod_time: formatDate(v.vodTime),
        vod_remarks: v.vodRemarks || '',
        vod_play_from: v.vodPlayFrom,
        vod_pic: v.vodPic || '',
        vod_pic_thumb: v.vodPic || '',
        vod_pic_slide: v.vodPic || '',
        vod_pic_screenshot: v.vodPic || '',
        vod_area: v.vodArea || '',
        vod_lang: v.vodLang || '',
        vod_year: v.vodYear || '',
        vod_actor: v.vodActor || '',
        vod_director: v.vodDirector || '',
        vod_content: v.vodContent || '',
        vod_play_url: v.vodPlayUrl,
        vod_hits: v.views,
      })))

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
