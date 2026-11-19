import { Request, Tag } from '@paperback/types'

export const API_URL = 'https://api.shinigami.io'
export const BASE_URL = 'https://s1.shinigami.mx'

export const createRequestObject = (requestObj: any): Request => {
    const url: string = requestObj?.url ?? ''
    const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(url.split('?')[0] ?? '') || /cdn\.shinigami\.gg|assets\.shngm\.id/i.test(url)

    const headers: Record<string, string> = isImage ? {
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': `${BASE_URL}/`,
        'DNT': '1',
        'Sec-GPC': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    } : {
        'Accept': 'application/json',
        'Origin': BASE_URL,
        'Referer': `${BASE_URL}/`,
        'DNT': '1',
        'Sec-GPC': '1',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }

    return App.createRequest({
        ...requestObj,
        headers: {
            ...headers,
            ...(requestObj.headers ?? {})
        }
    })
}

export const parseStatus = (status: number | string): string => {
    if (typeof status === 'string') {
        switch (status.toLowerCase()) {
            case 'ongoing': return 'Ongoing'
            case 'completed': return 'Completed'
            case 'hiatus': return 'Hiatus'
            case 'dropped':
            case 'cancelled': return 'Dropped'
        }
    }
    switch (Number(status)) {
        case 1: return 'Ongoing'
        case 2: return 'Completed'
        case 3: return 'Hiatus'
        default: return 'Unknown'
    }
}

export const getTaxonomyNames = (taxonomy: any, key: string): string => {
    return taxonomy?.[key]?.map((item: any) => item.name).join(', ') ?? ''
}

export const parseTaxonomyTags = (taxonomy: any, key: string): Tag[] => {
    return (taxonomy?.[key] ?? []).map((item: any) => App.createTag({
        id: String(item.slug ?? item.id ?? ''),
        label: String(item.name ?? '')
    }))
}
