import { Request } from '@paperback/types'

export const BASE_URL = 'https://v1.voratoon.com'
export const API_URL = 'https://api.voratoon.com'

// Covers are presigned S3 links on this host; page images live on cdn.voratoon.com unsigned
export const PRESIGN_HOST = 'cvr.voratoon.id'

export const createRequestObject = (requestObj: any): Request => {
    const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test((requestObj.url || '').split('?')[0] ?? '')

    const headers: Record<string, string> = {
        'Accept': isImage
            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            : 'application/json, text/plain, */*',
        'Referer': `${BASE_URL}/`,
        'Origin': BASE_URL,
        'Sec-GPC': '1'
    }

    return App.createRequest({
        ...requestObj,
        headers: {
            ...headers,
            ...(requestObj.headers ?? {})
        }
    })
}

export const parseStatus = (status: string): string => {
    switch ((status ?? '').toLowerCase()) {
        case 'ongoing': return 'Ongoing'
        case 'completed': return 'Completed'
        case 'hiatus': return 'Hiatus'
        case 'cancelled':
        case 'dropped': return 'Dropped'
        default: return 'Unknown'
    }
}

export const parseDate = (dateStr: string): Date => {
    if (!dateStr) return new Date()
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? new Date() : date
}

// Synopsis comes back as CMS HTML — Paperback renders the raw markup otherwise
export const stripHtml = (raw: string): string => {
    if (!raw) return ''
    return raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
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

// Presigned covers die after X-Amz-Expires seconds (86400 today), so a URL the app
// cached in an earlier session points at a dead signature.
export const isPresignExpired = (url: string): boolean => {
    const signedAt = url.match(/X-Amz-Date=(\d{8}T\d{6}Z)/)?.[1]
    const lifetime = Number(url.match(/X-Amz-Expires=(\d+)/)?.[1] ?? 0)
    if (!signedAt || !lifetime) return false

    const iso = `${signedAt.slice(0, 4)}-${signedAt.slice(4, 6)}-${signedAt.slice(6, 8)}T${signedAt.slice(9, 11)}:${signedAt.slice(11, 13)}:${signedAt.slice(13, 15)}Z`
    const expiresAt = Date.parse(iso) + lifetime * 1000
    if (isNaN(expiresAt)) return false

    return Date.now() >= expiresAt - 60 * 1000
}

// /prod/series/<slug>/cover/... — ask the API for the same series to get a fresh signature
export const refreshCoverUrl = async (requestManager: any, url: string): Promise<string> => {
    const slug = url.match(/\/series\/([^/]+)\//)?.[1]
    if (!slug) return url

    const response = await requestManager.schedule(createRequestObject({
        url: `${API_URL}/series/${slug}?includeMeta=true`,
        method: 'GET'
    }), 1)
    const data = JSON.parse(response.data as string)

    return data?.data?.data?.coverImage || url
}
