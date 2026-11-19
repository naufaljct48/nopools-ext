import { Request } from '@paperback/types'

export const BASE_URL = 'https://komikcast.info'

export const createRequestObject = (requestObj: any): Request => {
    const url: string = requestObj?.url ?? ''
    const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(url.split('?')[0] ?? '')

    const headers: Record<string, string> = {
        'Accept': isImage
            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': `${BASE_URL}/`,
        ...(isImage ? {} : { 'Origin': BASE_URL }),
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

export const normalizeUrl = (url: string): string => {
    const trimmed = String(url ?? '').trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`
    if (trimmed.startsWith('https://')) return trimmed
    if (trimmed.startsWith('//')) return `https:${trimmed}`
    if (trimmed.startsWith('/')) return `${BASE_URL}${trimmed}`
    return `${BASE_URL}/${trimmed}`
}

export const parseStatus = (status: string): string => {
    switch (String(status ?? '').toLowerCase()) {
        case 'ongoing':
        case 'publishing': return 'Ongoing'
        case 'completed':
        case 'tamat':
        case 'finished': return 'Completed'
        case 'hiatus': return 'Hiatus'
        case 'dropped':
        case 'cancelled': return 'Dropped'
        default: return 'Unknown'
    }
}

export const parseDate = (dateStr: string): Date => {
    if (!dateStr) return new Date()
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? new Date() : d
}

export const stripHtml = (raw: string): string => {
    if (!raw) return ''
    return raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
        .replace(/<(p|div|li|h[1-6])(?:\s[^>]*)?>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}
