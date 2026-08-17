import { Request } from '@paperback/types'

// Same site, two domains — one is used as a fallback when the other is unreachable
export const DOMAINS = [
    'https://comick.live',
    'https://comick.art'
]

export const DEFAULT_DOMAIN = DOMAINS[0] as string
export const DEFAULT_LANGUAGE = 'en'

// Languages comick publishes in, as their chapter-list `lang` codes
export const LANGUAGES: Record<string, string> = {
    en: 'English',
    id: 'Indonesian',
    ar: 'Arabic',
    de: 'German',
    es: 'Spanish',
    'es-419': 'Spanish (LatAm)',
    fr: 'French',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    pl: 'Polish',
    'pt-br': 'Portuguese (BR)',
    ru: 'Russian',
    th: 'Thai',
    tr: 'Turkish',
    uk: 'Ukrainian',
    vi: 'Vietnamese',
    zh: 'Chinese',
    'zh-hk': 'Chinese (HK)'
}

// Paperback shows the flag emoji on each chapter row
export const LANGUAGE_FLAGS: Record<string, string> = {
    en: '🇬🇧',
    id: '🇮🇩',
    ar: '🇸🇦',
    de: '🇩🇪',
    es: '🇪🇸',
    'es-419': '🇲🇽',
    fr: '🇫🇷',
    it: '🇮🇹',
    ja: '🇯🇵',
    ko: '🇰🇷',
    pl: '🇵🇱',
    'pt-br': '🇧🇷',
    ru: '🇷🇺',
    th: '🇹🇭',
    tr: '🇹🇷',
    uk: '🇺🇦',
    vi: '🇻🇳',
    zh: '🇨🇳',
    'zh-hk': '🇭🇰'
}

// The CDN rejects any request whose Referer is not the site itself (a Referer of the
// CDN host answers 403), so image requests must borrow the site domain.
export const refererFor = (url: string): string => {
    const origin = url.match(/^https?:\/\/[^/]+/)?.[0] ?? DEFAULT_DOMAIN
    return DOMAINS.includes(origin) ? `${origin}/` : `${DEFAULT_DOMAIN}/`
}

export const createRequestObject = (options: { url: string, method?: string, headers?: Record<string, string> }): Request => {
    const isImage = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(options.url)
    const isApi = options.url.includes('/api/')

    return App.createRequest({
        url: options.url,
        method: (options.method ?? 'GET') as any,
        headers: {
            'Accept': isImage
                ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                : isApi
                    ? 'application/json, text/plain, */*'
                    : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': refererFor(options.url),
            'Accept-Language': 'en-US,en;q=0.9',
            ...(isApi ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
            ...(options.headers ?? {})
        }
    })
}

// comic-data / sv-data are JSON blobs embedded in the page; a regex keeps this
// source cheerio-free (smaller bundle, no DOM parse on huge reader pages)
export const extractEmbeddedJson = (html: string, id: string): any => {
    const match = html.match(new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)</script>`))
    if (!match?.[1]) {
        throw new Error(`Failed to find #${id} payload — the site layout likely changed`)
    }
    return JSON.parse(match[1].trim())
}

export const parseStatus = (status: number, translationCompleted?: boolean): string => {
    switch (status) {
        case 1: return 'Ongoing'
        case 2: return translationCompleted === false ? 'Ongoing' : 'Completed'
        case 3: return 'Dropped'
        case 4: return 'Hiatus'
        default: return 'Unknown'
    }
}

export const parseDate = (value: string): Date => {
    if (!value) return new Date()
    const date = new Date(value)
    return isNaN(date.getTime()) ? new Date() : date
}

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
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

// The country a title originates from is shown as its comic type
export const countryLabel = (country: string): string | undefined => {
    switch ((country ?? '').toLowerCase()) {
        case 'jp': return 'Manga'
        case 'cn': return 'Manhua'
        case 'kr':
        case 'ko': return 'Manhwa'
        default: return undefined
    }
}
