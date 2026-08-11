import { Request } from '@paperback/types'

const WEBSITE_BASE = 'https://07.ikiru.wtf'

export const createRequestObject = (requestObj: any): Request => {
    const isImage = /\.(png|jpe?g|webp|gif)$/i.test(requestObj.url || '')

    const headers: Record<string, string> = {
        'Accept': isImage
            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': `${WEBSITE_BASE}/`,
        'Origin': WEBSITE_BASE,
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }

    return App.createRequest({
        method: 'GET',
        ...requestObj,
        headers: {
            ...headers,
            ...(requestObj.headers ?? {})
        }
    })
}

export const normalizeUrl = (url: string, baseUrl: string = WEBSITE_BASE): string => {
    if (!url) return ''
    // admin-ajax (Popular / Most Rated / search) hands back cleartext http:// links
    // while every other page uses https. iOS refuses to load those, so upgrade them.
    if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`
    if (url.startsWith('http')) return url
    if (url.startsWith('//')) return `https:${url}`
    if (url.startsWith('/')) return `${baseUrl}${url}`
    return `${baseUrl}/${url}`
}

export const decodeHTMLEntity = (str: string): string => {
    return str
        .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/')
}

export const convertTime = (timeStr: string): Date => {
    timeStr = timeStr.toLowerCase().trim()
    const now = new Date()

    if (/just now|sekarang|baru saja/i.test(timeStr)) return now

    const minutesMatch = timeStr.match(/(\d+)\s*(minute|menit|min)/i)
    if (minutesMatch?.[1]) return new Date(now.getTime() - parseInt(minutesMatch[1]) * 60 * 1000)

    const hoursMatch = timeStr.match(/(\d+)\s*(hour|jam|hr)/i)
    if (hoursMatch?.[1]) return new Date(now.getTime() - parseInt(hoursMatch[1]) * 60 * 60 * 1000)

    const daysMatch = timeStr.match(/(\d+)\s*(day|hari|hr)/i)
    if (daysMatch?.[1]) return new Date(now.getTime() - parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000)

    const weeksMatch = timeStr.match(/(\d+)\s*(week|minggu|wk)/i)
    if (weeksMatch?.[1]) return new Date(now.getTime() - parseInt(weeksMatch[1]) * 7 * 24 * 60 * 60 * 1000)

    const monthsMatch = timeStr.match(/(\d+)\s*(month|bulan|bln)/i)
    if (monthsMatch?.[1]) return new Date(now.getTime() - parseInt(monthsMatch[1]) * 30 * 24 * 60 * 60 * 1000)

    const yearsMatch = timeStr.match(/(\d+)\s*(year|tahun|yr)/i)
    if (yearsMatch?.[1]) return new Date(now.getTime() - parseInt(yearsMatch[1]) * 365 * 24 * 60 * 60 * 1000)

    return now
}

export const extractMangaId = (html: string): string | null => {
    const ajaxMatch = html.match(/manga_id[=:](\d+)/i)
    if (ajaxMatch?.[1]) return ajaxMatch[1]

    const dataMatch = html.match(/data-manga-id=["'](\d+)["']/i)
    if (dataMatch?.[1]) return dataMatch[1]

    const inputMatch = html.match(/<input[^>]*name=["']manga_id["'][^>]*value=["'](\d+)["']/i)
    if (inputMatch?.[1]) return inputMatch[1]

    return null
}
