import {
    BadgeColor,
    Chapter,
    ChapterDetails,
    ContentRating,
    HomeSection,
    HomeSectionType,
    PagedResults,
    Request,
    Response,
    SearchRequest,
    Source,
    SourceInfo,
    SourceIntents,
    SourceManga,
    TagSection
} from '@paperback/types'

import {
    API_URL,
    APP_SECRET,
    BASE_URL,
    createRequestObject,
    deviceId,
    unwrapResponse
} from './DoujinDesuHelper'
import {
    parseChapterDetails,
    parseChapterList,
    parseMangaDetails,
    parseMangaList,
    parseSearchTags
} from './DoujinDesuParser'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

export const DoujinDesuInfo: SourceInfo = {
    version: '6.0.2',
    name: 'DoujinDesu',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls adult manga from DoujinDesu (API-based)',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: BASE_URL,
    sourceTags: [
        { text: 'Indonesian', type: BadgeColor.GREY },
        { text: '18+', type: BadgeColor.RED }
    ],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

export class DoujinDesu extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(request.url)
                    || request.url.includes('desu.xxx/content/')
                    || request.url.includes('desu.pics')
                    || request.url.includes('cdnasu')

                request.headers = isImage ? {
                    ...(request.headers ?? {}),
                    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                    'Referer': `${BASE_URL}/`,
                    'User-Agent': USER_AGENT
                } : {
                    ...(request.headers ?? {}),
                    'Accept': 'application/json, text/plain, */*',
                    'X-App-Secret': APP_SECRET,
                    'x-app-secret': APP_SECRET,
                    'x-device-id': deviceId,
                    'x-device-name': 'Paperback',
                    'Referer': `${BASE_URL}/`,
                    'Origin': BASE_URL,
                    'User-Agent': USER_AGENT
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => response
        }
    })

    private async apiGet(url: string): Promise<any> {
        const response = await this.requestManager.schedule(createRequestObject({ url }), 1)
        if (response.status === 403 || response.status === 503) {
            throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease open ${BASE_URL} with the cloud icon first.`)
        }
        if (response.status === 404) {
            throw new Error(`The requested page ${url} was not found.`)
        }
        return unwrapResponse(response.data as string)
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const data = await this.apiGet(`${API_URL}/manga/${encodeURIComponent(mangaId)}`)
        return parseMangaDetails(data, mangaId)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const data = await this.apiGet(`${API_URL}/manga/${encodeURIComponent(mangaId)}`)
        return parseChapterList(data?.chapters ?? [], mangaId)
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const data = await this.apiGet(`${API_URL}/chapters/${encodeURIComponent(chapterId)}`)
        return parseChapterDetails(data, mangaId, chapterId)
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                id: 'doujinshi_manga', title: 'Doujinshi & Manga',
                url: `${API_URL}/manga?type=doujinshi,manga&limit=20&sort=updated_at_desc`,
                type: HomeSectionType.singleRowNormal
            },
            {
                id: 'manhwa', title: 'Manhwa',
                url: `${API_URL}/manga?type=manhwa&limit=20&sort=updated_at_desc`,
                type: HomeSectionType.singleRowNormal
            }
        ]

        for (const item of sections) {
            const section = App.createHomeSection({
                id: item.id,
                title: item.title,
                type: item.type,
                containsMoreItems: true
            })
            sectionCallback(section)

            const data = await this.apiGet(item.url)
            section.items = parseMangaList(Array.isArray(data) ? data : data?.data ?? [])
            sectionCallback(section)
        }
    }

    async getHomePageSection(sectionCallback: (section: HomeSection) => void): Promise<void> {
        return this.getHomePageSections(sectionCallback)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        const limit = 20
        const type = homepageSectionId === 'manhwa' ? 'manhwa' : 'doujinshi,manga'
        const offset = (page - 1) * limit

        const data = await this.apiGet(`${API_URL}/manga?type=${encodeURIComponent(type)}&limit=${limit}&offset=${offset}&sort=updated_at_desc`)
        const items = Array.isArray(data) ? data : data?.data ?? []
        const results = parseMangaList(items)

        return App.createPagedResults({
            results,
            metadata: results.length >= limit ? { page: page + 1 } : undefined
        })
    }

    async getSearchTags(): Promise<TagSection[]> {
        const data = await this.apiGet(`${API_URL}/genres`)
        return parseSearchTags(Array.isArray(data) ? data : [])
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        const limit = 20
        const offset = (page - 1) * limit

        const title = (query.title ?? '').trim()
        const genre = (query.includedTags ?? [])
            .map(t => String(t.id ?? ''))
            .find(id => id.startsWith('genre:'))
            ?.replace('genre:', '') ?? ''

        // Manual query building — URLSearchParams does not exist in the Paperback iOS runtime
        const parts: string[] = []
        if (title) parts.push(`search=${encodeURIComponent(title)}`)
        if (genre) parts.push(`genre=${encodeURIComponent(genre)}`)
        parts.push(`limit=${limit}`)
        parts.push(`offset=${offset}`)

        const data = await this.apiGet(`${API_URL}/manga?${parts.join('&')}`)
        const items = Array.isArray(data) ? data : data?.data ?? []
        const results = parseMangaList(items)

        return App.createPagedResults({
            results,
            metadata: results.length >= limit ? { page: page + 1 } : undefined
        })
    }

    async getCloudflareBypassRequestAsync(): Promise<Request> {
        return createRequestObject({
            url: `${BASE_URL}/`,
            headers: {
                'referer': `${BASE_URL}/`,
                'origin': `${BASE_URL}/`,
                'user-agent': USER_AGENT
            }
        })
    }

    getCloudflareBypassRequest(): Request {
        return createRequestObject({
            url: `${BASE_URL}/`,
            headers: {
                'referer': `${BASE_URL}/`,
                'origin': `${BASE_URL}/`,
                'user-agent': USER_AGENT
            }
        })
    }

    getMangaShareUrl(mangaId: string): string {
        return `${BASE_URL}/manga/${mangaId}/`
    }
}
