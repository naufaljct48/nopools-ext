import { Request } from '@paperback/types'

export const WEBSITE_BASE = 'https://03.lumosgg.com'

export const createRequestObject = (requestObj: any): Request => {
    const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(requestObj.url || '')

    const headers: Record<string, string> = {
        'Accept': isImage
            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': `${WEBSITE_BASE}/`,
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
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

export const normalizeUrl = (url: string): string => {
    if (!url) return ''
    if (url.startsWith('http')) return url
    if (url.startsWith('//')) return `https:${url}`
    if (url.startsWith('/')) return `${WEBSITE_BASE}${url}`
    return `${WEBSITE_BASE}/${url}`
}

export const decodeHTMLEntity = (str: string): string => {
    if (!str) return ''
    return str
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, '\'')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
}

export const stripTags = (html: string): string =>
    html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

export const cleanText = (html: string): string => decodeHTMLEntity(stripTags(html))

export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The site only ships relative Indonesian timestamps ("4 menit lalu", "1 bulan lalu")
export const convertTime = (timeStr: string): Date => {
    const now = new Date()
    const str = timeStr.toLowerCase().trim()

    if (/baru saja|just now|sekarang/.test(str)) return now

    const amount = parseInt(str.match(/(\d+)/)?.[1] ?? '0')
    if (!amount) return now

    const units: Array<[RegExp, number]> = [
        [/detik|second/, 1000],
        [/menit|minute/, 60 * 1000],
        [/jam|hour/, 60 * 60 * 1000],
        [/hari|day/, 24 * 60 * 60 * 1000],
        [/minggu|week/, 7 * 24 * 60 * 60 * 1000],
        [/bulan|month/, 30 * 24 * 60 * 60 * 1000],
        [/tahun|year/, 365 * 24 * 60 * 60 * 1000]
    ]

    for (const [pattern, ms] of units) {
        if (pattern.test(str)) return new Date(now.getTime() - amount * ms)
    }

    return now
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// The full synopsis is only shipped base64 encoded in a data attribute, and the
// Paperback runtime has no atob/Buffer. Decoded to percent-escapes so
// decodeURIComponent can handle the UTF-8 sequences.
export const decodeBase64 = (input: string): string => {
    let bits = 0
    let accumulator = 0
    let escaped = ''

    for (const char of input.replace(/[^A-Za-z0-9+/]/g, '')) {
        const value = BASE64_CHARS.indexOf(char)
        if (value < 0) continue

        accumulator = (accumulator << 6) | value
        bits += 6

        if (bits >= 8) {
            bits -= 8
            const byte = (accumulator >> bits) & 0xFF
            escaped += `%${byte < 16 ? '0' : ''}${byte.toString(16)}`
        }
    }

    try {
        return decodeURIComponent(escaped)
    } catch (error) {
        return escaped.replace(/%([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    }
}
