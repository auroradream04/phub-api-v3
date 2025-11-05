import { Route } from '../../apis'
import { getAttribute, getCheerio, getDataAttribute } from '../../utils/cheerio'
import { parseReadableNumber } from '../../utils/number'
import { toHHMMSS } from '../../utils/time'
import { UrlParser } from '../../utils/url'
import type { Engine } from '../../core/engine'
import type { CheerioAPI } from 'cheerio'

export interface MediaDefinition {
    defaultQuality: boolean | number
    format: string
    videoUrl: string
    quality: number | number[]
    remote: boolean
}

export interface VideoPage {
    id: string
    url: string
    title: string
    views: number
    vote: {
        up: number
        down: number
        total: number
        rating: number
    }
    premium: boolean
    thumb: string
    preview: string
    /**
     * @deprecated We no longer support video download. Use alternative tools such as `yt-dlp` instead.
     */
    videos: Array<{
        url: string
        quality: string
        filename: string
        extension: string
    }>
    mediaDefinitions: MediaDefinition[]
    provider: {
        username: string
        url: string
    } | null
    /** video duration (in second) */
    duration: number
    /** video duration formatted in "(HH:)mm:ss". eg. "32:09", "01:23:05" */
    durationFormatted: string
    tags: string[]
    pornstars: string[]
    categories: string[]
    uploadDate: Date
}

export async function videoPage(engine: Engine, urlOrId: string): Promise<VideoPage> {
    const id = UrlParser.getVideoID(urlOrId)
    const url = Route.videoPage(id)
    const res = await engine.request.get(url)
    const html = await res.text()
    const $ = getCheerio(html)

    return {
        id,
        url,
        mediaDefinitions: parseMediaDefinition(html),
        ...parseByDom(html, $),
    }
}

export function parseByDom(html: string, $: CheerioAPI) {
    const voteUp = parseReadableNumber($('span.votesUp').text() || '0')
    const voteDown = parseReadableNumber($('span.votesDown').text() || '0')

    const title = $('head > title').first().text().replace(' - Pornhub.com', '')
    const viewsText = $('span.count').text() || '0'
    const views = parseReadableNumber(viewsText)
    const totalVote = voteUp + voteDown
    const vote = {
        up: voteUp,
        down: voteDown,
        total: totalVote,
        rating: totalVote === 0 ? 0 : Math.round(voteUp / totalVote * 100) / 100,
    }
    const premium = $('#videoTitle .ph-icon-badge-premium').length !== 0
    const thumb = getAttribute<string>($('.thumbnail img'), 'src', '')
    const preview = getAttribute<string>($('head meta[property="og:image"]'), 'content', '')

    // wtf...is this double rel a coding bug from pornhub?
    // <a rel="rel="nofollow"" href="/users/xxxx"  class="bolded">XXXXX</a>
    const providerLink = $('.usernameBadgesWrapper a.bolded').first()
    const provider = providerLink.length
        ? { username: providerLink.text(), url: getAttribute<string>(providerLink, 'href', '') }
        : null

    const trafficJunkyMeta = $('head meta[name=adsbytrafficjunkycontext]')
    const tags = getDataAttribute<string>(trafficJunkyMeta, 'context-tag')?.split(',') || []
    const pornstars = getDataAttribute<string>(trafficJunkyMeta, 'context-pornstar')?.split(',') || []
    const categories = getDataAttribute<string>(trafficJunkyMeta, 'context-category')?.split(',') || []

    const durationMeta = $('head meta[property="video:duration"]')
    const duration = +getAttribute<number>(durationMeta, 'content', 0)
    const durationFormatted = toHHMMSS(duration)

    return {
        title,
        views,
        vote,
        premium,
        thumb,
        preview,
        videos: [],
        provider,
        tags,
        pornstars,
        categories,
        duration,
        durationFormatted,
        ...parseByLdJson($),
    }
}

function parseByLdJson($: CheerioAPI) {
    try {
        const ldJsonElement = $('head script[type="application/ld+json"]').first()
        const ldJsonText = ldJsonElement.text().trim()

        // Check if the element exists and has content
        if (!ldJsonText) {
            return {
                uploadDate: new Date(0),
            }
        }

        const ldPlusJson = JSON.parse(ldJsonText)
        const uploadDate = new Date(ldPlusJson.uploadDate)
        return {
            uploadDate,
        }
    }
    catch (error) {
        // Silently handle the error - this is optional metadata
        return {
            uploadDate: new Date(0),
        }
    }
}

/**
 * Handle '"270"' -> 270
 */
function parseStringNumber(str: string): number {
    return +str.replace(/"/g, '')
}

const mediaDefinitionRegex = /{("group":\d+,"height":\d+,"width":\d+,)?"defaultQuality":(true|false|\d+),"format":"(\w+)","videoUrl":"(.+?)","quality":(("\d+")|(\[[\d,]*\]))(,"segmentFormats":\{[^}]+\})?(,"remote":(true|false))?}/g
export function parseMediaDefinition(html: string): MediaDefinition[] {
    const mediaDefinitions: MediaDefinition[] = []
    let matchCount = 0

    while (true) {
        const match = mediaDefinitionRegex.exec(html)
        if (!match) {
            break
        }
        matchCount++

        try {
            const [,, _defaultQuality, format, _videoUrl, _quality, ,_qualityArray, , , _remote] = match
            const defaultQuality = _defaultQuality === 'true'
                ? true
                : _defaultQuality === 'false'
                    ? false
                    : +_defaultQuality

            // Parse these early so they're available in the concatenated JSON block
            const quality = _qualityArray ? JSON.parse(_qualityArray) as number[] : parseStringNumber(_quality)
            const remote = _remote === 'true'

            // Remove escaped forward slashes
            let videoUrl = _videoUrl.replace(/\\\//g, '/')

            // Remove any remaining escaped quotes
            videoUrl = videoUrl.replace(/\\"/g, '"')

            // Check if there's concatenated JSON in the videoUrl (malformed response)
            // Pattern: url","quality":"1080",...}},{"group":1,...,"videoUrl":"url2",...
            if (videoUrl.includes('","quality":"')) {
                // This videoUrl contains multiple definitions concatenated
                // Split by "},{"" to get individual items
                const firstUrlEnd = videoUrl.indexOf('","quality":"')
                const actualFirstUrl = videoUrl.substring(0, firstUrlEnd)
                const restOfJson = videoUrl.substring(firstUrlEnd + 3) // Skip "," to start from quality (without leading quote)

                // Build proper JSON array from the concatenated data
                // The restOfJson might be incomplete (unterminated string), so we need to close it properly
                let jsonStr = `[{"videoUrl":"${actualFirstUrl}","${restOfJson}`

                // Check if the JSON string ends properly (should end with }])
                // If it ends with an incomplete string, we need to find the last complete object
                if (!jsonStr.trim().endsWith(']') && !jsonStr.trim().endsWith('}')) {
                    // Find the last complete object by looking for "}}" (end of an object with nested objects)
                    const lastCompleteObj = jsonStr.lastIndexOf('}}')
                    if (lastCompleteObj !== -1) {
                        // Truncate to the last complete object and close the array
                        jsonStr = `${jsonStr.substring(0, lastCompleteObj + 2)}]`
                    }
                }

                try {
                    const parsedItems = JSON.parse(jsonStr) as Array<{
                        videoUrl: string
                        quality: string | number[]
                        format?: string
                        defaultQuality?: boolean
                        height?: number
                        width?: number
                        group?: number
                        remote?: boolean
                        segmentFormats?: any
                    }>

                    // Add all parsed items
                    for (const item of parsedItems) {
                        mediaDefinitions.push({
                            defaultQuality: item.defaultQuality ?? defaultQuality,
                            format: item.format || format,
                            videoUrl: item.videoUrl,
                            quality: typeof item.quality === 'string' ? parseStringNumber(item.quality) : (item.quality || []),
                            remote: item.remote ?? remote,
                        })
                    }

                    // Skip adding the original item since we added all parsed items
                    continue
                }
                catch (parseError) {
                    videoUrl = actualFirstUrl
                }
            }

            // Add the single item (if we didn't continue above)
            mediaDefinitions.push({
                defaultQuality,
                format,
                videoUrl,
                quality,
                remote,
            })
        }
        catch (error) {

        }
    }

    return mediaDefinitions
}
