import { Request } from '@paperback/types'

export const BASE_URL = 'https://comix.to'
export const API_URL = `${BASE_URL}/api/v1`

export const createRequestObject = (requestObj: any): Request => App.createRequest({
    ...requestObj,
    headers: {
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${BASE_URL}/`,
        'Origin': BASE_URL,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        'Sec-GPC': '1',
        ...(requestObj.headers ?? {})
    }
})

export const parseStatus = (status: string): string => {
    switch (status?.toLowerCase()) {
        case 'releasing': return 'Ongoing'
        case 'finished': return 'Completed'
        case 'on_hiatus': return 'Hiatus'
        case 'discontinued': return 'Abandoned'
        default: return 'Unknown'
    }
}

// Genre list — numeric IDs from Comix API
export const GENRES: { label: string; id: string }[] = [
    { label: 'Romance', id: '23' },
    { label: 'Drama', id: '11' },
    { label: 'Comedy', id: '9' },
    { label: 'Fantasy', id: '12' },
    { label: 'Slice of Life', id: '25' },
    { label: 'Action', id: '6' },
    { label: 'Boys Love', id: '8' },
    { label: 'Adventure', id: '7' },
    { label: 'Adult', id: '87264' },
    { label: 'Smut', id: '87268' },
    { label: 'Psychological', id: '22' },
    { label: 'Mystery', id: '20' },
    { label: 'Historical', id: '14' },
    { label: 'Mature', id: '87267' },
    { label: 'Tragedy', id: '29' },
    { label: 'Sci-Fi', id: '24' },
    { label: 'Ecchi', id: '87265' },
    { label: 'Horror', id: '15' },
    { label: 'Girls Love', id: '13' },
    { label: 'Isekai', id: '16' },
    { label: 'Hentai', id: '87266' },
    { label: 'Thriller', id: '28' },
    { label: 'Sports', id: '26' },
    { label: 'Crime', id: '10' },
    { label: 'Philosophical', id: '21' },
    { label: 'Mecha', id: '18' },
    { label: 'Wuxia', id: '30' },
    { label: 'Medical', id: '19' },
    { label: 'Superhero', id: '27' },
    { label: 'Magical Girls', id: '17' },
]

export const FORMATS: { label: string; id: string }[] = [
    { label: '4-Koma', id: '93164' },
    { label: 'Adaptation', id: '93167' },
    { label: 'Anthology', id: '93165' },
    { label: 'Award Winning', id: '93166' },
    { label: 'Doujinshi', id: '93168' },
    { label: 'Full Color', id: '93172' },
    { label: 'Long Strip', id: '93170' },
    { label: 'Oneshot', id: '93169' },
    { label: 'Web Comic', id: '93171' },
]
