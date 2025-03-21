import { Request, HomeSection, PagedResults, Tag, TagSection } from '@paperback/types'

const BASE_URL = 'https://app.shinigami.asia'

export const createRequestObject = (requestObj: any): Request => {
    return App.createRequest({
        ...requestObj,
        headers: {
            ...(requestObj.headers ?? {}),
            'Accept': 'application/json',
            'Origin': BASE_URL,
            'DNT': '1',
            'Sec-GPC': '1'
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