import { Request } from '@paperback/types'

export const BASE_URL = 'https://comix.to'
export const API_URL = `${BASE_URL}/api/v1`

// Comix protects some endpoints with a frontend-generated anti-abuse query value.
// Current value observed from live network requests. If it rotates, update here.
export const API_TOKEN = 'YchAkKIHsEZwpi6s3QD9H8QKGSBjiB3l0g2WM4T81UgQ3lUQMcWv5mQGeOkg-aeEapkkCXnvO5CB39rUUwyzOw'
export const CHAPTER_TOKEN = 'YchAkKIHsEZwpi6s3QD9H8QKGSBjiB3l0g2WM4T81UgQ3lXQMWSvhWQneKIg8af8uUlk8wt1uAn4JG4'

export const createRequestObject = (requestObj: any): Request => App.createRequest({
    ...requestObj,
    headers: {
        'Accept': requestObj.url?.includes('/api/') ? 'application/json' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BASE_URL}/`,
        'Origin': BASE_URL,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        ...(requestObj.headers ?? {})
    }
})

export const parseStatus = (status: string): string => {
    switch (status?.toLowerCase()) {
        case 'releasing': return 'Ongoing'
        case 'completed': return 'Completed'
        case 'hiatus':
        case 'on_hiatus': return 'Hiatus'
        case 'cancelled': return 'Abandoned'
        default: return 'Unknown'
    }
}

export const getIdFromUrl = (url: string): string => url.match(/\/title\/([^/]+)(?:\/|$)/)?.[1]?.split('-')[0] ?? ''
