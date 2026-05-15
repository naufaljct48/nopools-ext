import { Request } from '@paperback/types'

export const BASE_URL = 'https://komiku.org'
export const API_URL = 'https://api.komiku.org'

export const createRequestObject = (requestObj: any): Request => {
    const url = requestObj.url || ''
    const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(url) ||
        url.includes('thumbnail.komiku.org') ||
        url.includes('img.komiku.org')

    const headers: Record<string, string> = isImage
        ? {
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': `${BASE_URL}/`,
        }
        : {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Origin': BASE_URL,
            'Referer': `${BASE_URL}/`,
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

export const decodeHTMLEntity = (str: string): string => {
    if (!str) return ''
    return str
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/')
}

export const stripTags = (html: string): string =>
    html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

export const cleanText = (html: string): string =>
    decodeHTMLEntity(stripTags(html))

export const parseStatus = (status: string): string => {
    const s = status.toLowerCase()
    if (s.includes('ongoing') || s.includes('berlangsung')) return 'Ongoing'
    if (s.includes('end') || s.includes('tamat') || s.includes('completed')) return 'Completed'
    if (s.includes('hiatus')) return 'Hiatus'
    return 'Unknown'
}

// Converts relative date strings like "3 hari lalu" to Date
export const convertRelativeDate = (timeStr: string): Date => {
    const now = new Date()
    const s = timeStr.toLowerCase().trim()

    if (/baru saja|just now/i.test(s)) return now

    const m = s.match(/(\d+)\s*(menit|minute|min)/)
    if (m?.[1]) return new Date(now.getTime() - parseInt(m[1]) * 60 * 1000)

    const h = s.match(/(\d+)\s*(jam|hour|hr)/)
    if (h?.[1]) return new Date(now.getTime() - parseInt(h[1]) * 3600 * 1000)

    const d = s.match(/(\d+)\s*(hari|day)/)
    if (d?.[1]) return new Date(now.getTime() - parseInt(d[1]) * 86400 * 1000)

    const w = s.match(/(\d+)\s*(minggu|week)/)
    if (w?.[1]) return new Date(now.getTime() - parseInt(w[1]) * 7 * 86400 * 1000)

    const mo = s.match(/(\d+)\s*(bulan|month)/)
    if (mo?.[1]) return new Date(now.getTime() - parseInt(mo[1]) * 30 * 86400 * 1000)

    const y = s.match(/(\d+)\s*(tahun|year)/)
    if (y?.[1]) return new Date(now.getTime() - parseInt(y[1]) * 365 * 86400 * 1000)

    // Try DD/MM/YYYY format
    const dmy = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (dmy?.[1] && dmy[2] && dmy[3]) return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]))

    return now
}
