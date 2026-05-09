import { Request } from '@paperback/types'

const API_URL = 'https://be.komikcast.fit'
const BASE_URL = 'https://v2.komikcast.fit'

// Token from your curl request - might need to be dynamic/rotated
const AUTH_TOKEN = 'oat_NTQwNjU.eVU0Tjc4aEhpNmlwcDJkNWlDSU9GT0w2VXJxR25UdFc5UnV0dHRGdzY1MDY1NjYyNw'

export const createRequestObject = (requestObj: any): Request => {
    const isImage = /\.(png|jpe?g|webp|gif)$/i.test(requestObj.url || '')
    
    const headers: Record<string, string> = {
        'Accept': isImage
            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            : 'application/json, text/plain, */*',
        'Referer': `${BASE_URL}/`,
        'Origin': BASE_URL,
        'Sec-GPC': '1',
    }

    // Add auth token for API requests
    if (!isImage && (requestObj.url || '').includes(API_URL)) {
        headers['Authorization'] = `Bearer ${AUTH_TOKEN}`
    }

    return App.createRequest({
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
    if (url.startsWith('/')) return `${BASE_URL}${url}`
    return `${BASE_URL}/${url}`
}

export const parseStatus = (status: string): string => {
    switch (status?.toLowerCase()) {
        case 'ongoing': return 'Ongoing'
        case 'completed': return 'Completed'
        default: return 'Unknown'
    }
}

export const parseDate = (dateStr: string): Date => {
    if (!dateStr) return new Date()
    try {
        return new Date(dateStr)
    } catch {
        return new Date()
    }
}
