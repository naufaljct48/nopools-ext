import { Request, Tag } from '@paperback/types'

const BASE_URL = 'https://app.shinigami.asia'

export const createRequestObject = (requestObj: any): Request => {
    const headers = {
        'Accept': 'application/json',
        'Origin': BASE_URL,
        'DNT': '1',
        'Sec-GPC': '1',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }

    return App.createRequest({
        ...requestObj,
        headers: {
            ...headers,
            ...(requestObj.headers ?? {})
        }
    })
}

export const parseStatus = (status: number): string => {
    switch (status) {
        case 1: return 'Ongoing'
        case 2: return 'Completed'
        default: return 'Unknown'
    }
}

export const getTaxonomyNames = (taxonomy: any, key: string): string => {
    return taxonomy[key]?.map((item: any) => item.name).join(', ') ?? ''
}

export const parseTaxonomyTags = (taxonomy: any, key: string): Tag[] => {
    return (taxonomy[key] ?? []).map((item: any) => App.createTag({
        id: item.id.toString(),
        label: item.name
    }))
}
