import { Source, Chapter, ChapterDetails, HomeSection, SearchRequest, PagedResults, HomeSectionType, SourceInfo, ContentRating, BadgeColor, SourceIntents, TagSection, Request, Response, SourceManga } from '@paperback/types'
import { createRequestObject } from './WestMangaHelper'
import { parseMangaDetails, parseChapterList, parseChapterDetails, parseMangaList, parseSearchTags } from './WestMangaParser'

const WEBSITE_BASE = 'https://westmanga.me'
const API_BASE = 'https://data.westmanga.me'

export const WestMangaInfo: SourceInfo = {
    version: '1.1.0',
    name: 'WestManga',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension yang mengambil manga dari WestManga (API)',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: WEBSITE_BASE,
    sourceTags: [{ text: 'Indonesian', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

export class WestManga extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /(\.(png|jpe?g|webp|gif)$)|storage\./i.test(request.url)
                const isApi = /data\.westmanga\.me\/api/i.test(request.url)
                request.headers = {
                    ...(request.headers ?? {} as Record<string, string>),
                    'Accept': isApi
                        ? 'application/json,*/*;q=0.8'
                        : isImage
                            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Origin': WEBSITE_BASE,
                    'Referer': `${WEBSITE_BASE}/`,
                    'DNT': '1',
                    'Sec-GPC': '1',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    private parseJSON(response: Response): any {
        const data = response?.data
        if (!data) return {}
        try {
            return typeof data === 'string' ? JSON.parse(data) : data
        } catch (e) {
            return data
        }
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = createRequestObject({ url: `${API_BASE}/api/comic/${mangaId}`, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const json = this.parseJSON(response)
        return parseMangaDetails(json, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({ url: `${API_BASE}/api/comic/${mangaId}`, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const json = this.parseJSON(response)
        return parseChapterList(json)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const slug = chapterId.replace(/^\/?v\//, '')
        const request = createRequestObject({ url: `${API_BASE}/api/v/${slug}`, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const json = this.parseJSON(response)
        return parseChapterDetails(json, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections: { request: any, section: HomeSection }[] = [
            {
                request: createRequestObject({ url: `${API_BASE}/api/contents?page=1&per_page=25&orderBy=Popular&project=false`, method: 'GET' }),
                section: App.createHomeSection({ id: 'popular_today', title: 'Popular Today', type: HomeSectionType.singleRowNormal, containsMoreItems: true })
            },
            {
                request: createRequestObject({ url: `${API_BASE}/api/contents?page=1&per_page=25&project=false`, method: 'GET' }),
                section: App.createHomeSection({ id: 'latest_update', title: 'Latest Update', type: HomeSectionType.singleRowNormal, containsMoreItems: true })
            }
        ]

        for (const s of sections) {
            sectionCallback(s.section)
            const response = await this.requestManager.schedule(s.request, 1)
            const json = this.parseJSON(response)
            s.section.items = parseMangaList(json)
            sectionCallback(s.section)
        }
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const request = createRequestObject({ url: `${API_BASE}/api/contents/genres`, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const json = this.parseJSON(response)
        return parseSearchTags(json)
    }

    override async getSearchResults(query: SearchRequest): Promise<PagedResults> {
        const title = query.title?.trim()
        const params: string[] = ['page=1', 'per_page=25', 'project=false']
        if (title) params.push(`search=${encodeURIComponent(title)}`)
        const request = createRequestObject({ url: `${API_BASE}/api/contents?${params.join('&')}`, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const json = this.parseJSON(response)
        const results = parseMangaList(json)
        const current = Number(json?.paginator?.current_page ?? 1)
        const last = Number(json?.paginator?.last_page ?? 1)
        return App.createPagedResults({ results, metadata: current < last ? { page: current + 1, last } : undefined })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = Number(metadata?.page ?? 1)
        const params: string[] = [`page=${page}`, 'per_page=25', 'project=false']
        if (homepageSectionId === 'popular_today') params.push('orderBy=Popular')
        else if (homepageSectionId !== 'latest_update') throw new Error(`Invalid homepage section id: ${homepageSectionId}`)

        const request = createRequestObject({ url: `${API_BASE}/api/contents?${params.join('&')}`, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const json = this.parseJSON(response)
        const results = parseMangaList(json)
        const current = Number(json?.paginator?.current_page ?? page)
        const last = Number(json?.paginator?.last_page ?? page)
        return App.createPagedResults({ results, metadata: current < last ? { page: current + 1, last } : undefined })
    }
}