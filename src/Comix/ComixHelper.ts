import { Request } from '@paperback/types'

export const BASE_URL = 'https://comix.to'
export const API_URL = `${BASE_URL}/api/v1`

// Token `_` di-generate oleh JS browser dari meta[name=cfg] yang di-decrypt
// oleh secure VM bundle. Token ini tied ke cf_clearance session.
// Paperback akan fetch token dari HTML halaman sebelum hit chapter API.
// Fallback: update manual kalau auto-fetch gagal.
export let CACHED_TOKEN = ''

/**
 * Extract token `_` dari HTML halaman comix.to.
 * Token ada di URL request yang dibuat JS — kita ambil dari meta cfg
 * yang sudah di-decode oleh VM, tapi karena kita tidak bisa run JS,
 * kita fetch halaman dan parse token dari script initial-data atau
 * gunakan pendekatan scrape chapter URL dari rendered HTML.
 *
 * Catatan: Token sebenarnya di-generate dari meta[name=cfg] oleh VM JS.
 * Kita tidak bisa decode sendiri tanpa run JS-nya.
 * Solusi: Paperback punya WebView untuk Cloudflare bypass — token bisa
 * di-capture dari sana, tapi API Paperback tidak expose intercept.
 *
 * Workaround: Parse chapter URLs langsung dari HTML (rendered via CF bypass).
 */
export const extractTokenFromHtml = (html: string): string => {
    // Token bisa ada di inline script sebagai query param
    const tokenMatch = html.match(/[?&]_=([\w\-_]+)/)
    if (tokenMatch?.[1]) return tokenMatch[1]
    return ''
}

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

export const createHtmlRequestObject = (requestObj: any): Request => App.createRequest({
    ...requestObj,
    headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': `${BASE_URL}/`,
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

// Genre list dari Filters.kt Tachiyomi — pakai numeric ID
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

export const getIdFromUrl = (url: string): string =>
    url.match(/\/title\/([^/]+)(?:\/|$)/)?.[1]?.split('-')[0] ?? ''
