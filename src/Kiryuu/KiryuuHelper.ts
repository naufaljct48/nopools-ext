import { Request } from '@paperback/types'

const WEBSITE_BASE = 'https://kiryuu03.com'

export const createRequestObject = (url: string, metadata: any = {}): Request => {
    const isImage = /\.(png|jpe?g|webp|gif)$/i.test(url)
    const headers: Record<string, string> = {
        'Accept': isImage
            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': `${WEBSITE_BASE}/`,
        'DNT': '1',
        'Sec-GPC': '1',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }

    return App.createRequest({
        url,
        method: 'GET',
        headers,
        ...metadata
    })
}

/**
 * Convert Indonesian date string to Date object
 * Supports formats like: "2 minutes ago", "5 jam yang lalu", "3 hari yang lalu"
 */
export const convertTime = (timeStr: string): Date => {
    timeStr = timeStr.toLowerCase().trim()
    const now = new Date()

    // Just now / sekarang
    if (/just now|sekarang|baru saja/i.test(timeStr)) {
        return now
    }

    // Minutes ago
    const minutesMatch = timeStr.match(/(\d+)\s*(minute|menit|min)/i)
    if (minutesMatch && minutesMatch[1]) {
        const minutes = parseInt(minutesMatch[1])
        return new Date(now.getTime() - minutes * 60 * 1000)
    }

    // Hours ago
    const hoursMatch = timeStr.match(/(\d+)\s*(hour|jam|hr)/i)
    if (hoursMatch && hoursMatch[1]) {
        const hours = parseInt(hoursMatch[1])
        return new Date(now.getTime() - hours * 60 * 60 * 1000)
    }

    // Days ago
    const daysMatch = timeStr.match(/(\d+)\s*(day|hari|hr)/i)
    if (daysMatch && daysMatch[1]) {
        const days = parseInt(daysMatch[1])
        return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    }

    // Weeks ago
    const weeksMatch = timeStr.match(/(\d+)\s*(week|minggu|wk)/i)
    if (weeksMatch && weeksMatch[1]) {
        const weeks = parseInt(weeksMatch[1])
        return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000)
    }

    // Months ago
    const monthsMatch = timeStr.match(/(\d+)\s*(month|bulan|bln)/i)
    if (monthsMatch && monthsMatch[1]) {
        const months = parseInt(monthsMatch[1])
        return new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000)
    }

    // Years ago
    const yearsMatch = timeStr.match(/(\d+)\s*(year|tahun|yr)/i)
    if (yearsMatch && yearsMatch[1]) {
        const years = parseInt(yearsMatch[1])
        return new Date(now.getTime() - years * 365 * 24 * 60 * 60 * 1000)
    }

    // Default to now if parsing failed
    return now
}

/**
 * Extract manga ID from HTML
 * Looks for manga_id in various places like data attributes, hidden inputs, or AJAX URLs
 */
export const extractMangaId = (html: string): string | null => {
    // Try to find in AJAX URL patterns
    const ajaxMatch = html.match(/manga_id[=:](\d+)/i)
    if (ajaxMatch && ajaxMatch[1]) return ajaxMatch[1]

    // Try to find in data attributes
    const dataMatch = html.match(/data-manga-id=["'](\d+)["']/i)
    if (dataMatch && dataMatch[1]) return dataMatch[1]

    // Try to find in hidden input
    const inputMatch = html.match(/<input[^>]*name=["']manga_id["'][^>]*value=["'](\d+)["']/i)
    if (inputMatch && inputMatch[1]) return inputMatch[1]

    return null
}

/**
 * Extract chapter ID from URL
 * Format: chapter-xxx.yyy where yyy is the chapter ID
 */
export const extractChapterId = (url: string): string | null => {
    const match = url.match(/chapter-[\d.]+\.(\d+)/i)
    return (match && match[1]) ? match[1] : null
}

/**
 * Clean and normalize URL
 */
export const normalizeUrl = (url: string, baseUrl: string = WEBSITE_BASE): string => {
    if (!url) return ''
    if (url.startsWith('http')) return url
    if (url.startsWith('//')) return `https:${url}`
    if (url.startsWith('/')) return `${baseUrl}${url}`
    return `${baseUrl}/${url}`
}

/**
 * Decode HTML entities
 */
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
