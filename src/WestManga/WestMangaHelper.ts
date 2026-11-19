import { Request } from '@paperback/types'

export const WEBSITE_BASE = 'https://v1.westmanga.my'
export const FALLBACK_BASES = [
    'https://v1.westmanga.my',
    'https://v1.westmanga.top'
]
export const PORTAL_URL = 'https://westmanga.site/'

export const normalizeUrl = (url: string, baseUrl: string = WEBSITE_BASE): string => {
    const trimmed = String(url ?? '').trim()
    if (!trimmed) return ''
    if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, 'https://')
    if (trimmed.startsWith('//')) return `https:${trimmed}`
    if (trimmed.startsWith('/')) return `${baseUrl}${trimmed}`
    return `${baseUrl}/${trimmed}`
}

export const createRequestObject = (requestObj: any, baseUrl: string = WEBSITE_BASE): Request => {
    const url: string = requestObj?.url ?? ''
    const isImage = /(\.(png|jpe?g|webp|gif|avif)$)|\/img\/|storage\./i.test(url.split('?')[0] ?? '')
    const isApi = /\/api\//i.test(url)

    const accept = isApi
        ? 'application/json, text/plain, */*'
        : (isImage
            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')

    const defaultHeaders: Record<string, string> = {
        'Accept': accept,
        'Origin': baseUrl,
        'Referer': `${baseUrl}/`,
        'DNT': '1',
        'Sec-GPC': '1',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }

    const extraHeadersObj = requestObj.headers ?? {}
    const extraHeaders: Record<string, string> = {}
    for (const k of Object.keys(extraHeadersObj)) {
        const v = extraHeadersObj[k]
        if (typeof v === 'string') extraHeaders[k] = v
    }

    return App.createRequest({
        method: 'GET',
        ...requestObj,
        headers: {
            ...defaultHeaders,
            ...extraHeaders
        }
    })
}
