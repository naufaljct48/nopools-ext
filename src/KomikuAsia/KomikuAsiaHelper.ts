import { Request } from '@paperback/types'

export const BASE_URL = 'https://01.komiku.asia'
export const API_URL = `${BASE_URL}/api/v2`

export const createRequestObject = (requestObj: any): Request => {
    const url: string = requestObj?.url ?? ''
    const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(url.split('?')[0] ?? '')

    const headers: Record<string, string> = {
        'Accept': isImage
            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            : 'application/json, text/plain, */*',
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

export const parseTimestamp = (val: any): Date => {
    if (typeof val === 'number' && val > 0) {
        return new Date(val > 1e12 ? val : val * 1000)
    }
    if (typeof val === 'string' && val.trim()) {
        const d = new Date(val)
        if (!isNaN(d.getTime())) return d
    }
    return new Date()
}
