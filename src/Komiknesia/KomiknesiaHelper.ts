import { Request } from '@paperback/types'

const BASE_URL = 'https://02.komiknesia.asia'

export const createRequestObject = (requestObj: any): Request => {
    const url = requestObj.url || ''
    const isImage = /\.(png|jpe?g|webp|gif)$/i.test(url) ||
        url.includes('cdn.itachi.my.id') ||
        url.includes('cloudhost.id') ||
        url.includes('ikiru.wtf')

    const headers: Record<string, string> = isImage
        ? {
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': `${BASE_URL}/`,
        }
        : {
            'Accept': '*/*',
            'Origin': BASE_URL,
            'Referer': `${BASE_URL}/`,
            'Sec-GPC': '1',
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
    switch (status?.toLowerCase()) {
        case 'ongoing': return 'Ongoing'
        case 'completed': return 'Completed'
        case 'hiatus': return 'Hiatus'
        default: return 'Unknown'
    }
}

export const stripHtml = (html: string): string => {
    if (!html) return ''
    return html.replace(/<[^>]*>/g, '').trim()
}
