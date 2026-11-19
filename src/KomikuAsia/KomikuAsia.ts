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
import { API_URL, BASE_URL, createRequestObject } from './KomikuAsiaHelper'
import {
    parseChapterDetails,
    parseChapterList,
    parseMangaDetails,
    parseMangaList,
    parseSearchTags
} from './KomikuAsiaParser'

const PAGE_SIZE = 24

const getTagValues = (query: SearchRequest, prefix: string): string[] => {
    const tags = (query as any)?.includedTags as Array<{ id: string }> | undefined
    if (!Array.isArray(tags)) return []
    const out: string[] = []
    for (const t of tags) {
        const val = String(t?.id ?? '')
        if (val.startsWith(prefix)) out.push(val.replace(prefix, ''))
    }
    return out
}

export const KomikuAsiaInfo: SourceInfo = {
    version: '5.0.0',
    name: 'KomikuAsia',
    description: `Extension that pulls manga from ${BASE_URL} (API-based)`,
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    icon: 'icon.png',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: BASE_URL,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
    sourceTags: [
        {
            text: 'Indonesia',
            type: BadgeColor.GREY
        }
    ]
}

export class KomikuAsia extends Source {
    private comicIdCache: Record<string, number> = {}

    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test((request.url || '').split('?')[0] ?? '')
                request.headers = {
                    ...(request.headers ?? {}),
                    'Referer': `${BASE_URL}/`,
                    ...(isImage ? { 'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' } : {})
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    private async apiGet(pathAndQuery: string): Promise<any> {
        const req = createRequestObject({ url: `${API_URL}${pathAndQuery}` })
        const res = await this.requestManager.schedule(req, 1)
        if (res.status === 403 || res.status === 503) {
            throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${BASE_URL}> and press the cloud icon.`)
        }
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    }

    private async resolveComicId(mangaId: string): Promise<number> {
        if (/^\d+$/.test(mangaId)) return Number(mangaId)
        const cached = this.comicIdCache[mangaId]
        if (cached) return cached
        const comic = await this.apiGet(`/comics/${encodeURIComponent(mangaId)}`)
        const numericId = Number(comic?.id ?? 0)
        if (!numericId) throw new Error(`Failed to resolve KomikuAsia comic id for ${mangaId}`)
        this.comicIdCache[mangaId] = numericId
        return numericId
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const comic = await this.apiGet(`/comics/${encodeURIComponent(mangaId)}`)
        if (comic?.id) this.comicIdCache[mangaId] = Number(comic.id)
        return parseMangaDetails(comic, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const comicId = await this.resolveComicId(mangaId)
        const data = await this.apiGet(`/comics/${comicId}/chapters`)
        const list = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : [])
        return parseChapterList(list, comicId, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        let comicId: number | string
        let chId: string

        if (chapterId.includes('/')) {
            const parts = chapterId.split('/')
            comicId = parts[0] ?? ''
            chId = parts[1] ?? ''
        } else {
            comicId = await this.resolveComicId(mangaId)
            chId = chapterId
        }

        const data = await this.apiGet(`/comics/${encodeURIComponent(String(comicId))}/chapters/id/${encodeURIComponent(chId)}`)
        return parseChapterDetails(data, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections: Array<{ path: string, extract: (d: any) => any[], section: HomeSection }> = [
            {
                path: '/comics/hero',
                extract: (d) => Array.isArray(d) ? d : [],
                section: App.createHomeSection({
                    id: 'featured',
                    title: 'Featured',
                    type: HomeSectionType.featured,
                    containsMoreItems: false
                })
            },
            {
                path: `/comics/latest-updates?page=1&limit=${PAGE_SIZE}`,
                extract: (d) => Array.isArray(d?.items) ? d.items : (Array.isArray(d) ? d : []),
                section: App.createHomeSection({
                    id: 'latest_update',
                    title: 'Latest Updates',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                path: `/comics/trending?page=1&limit=${PAGE_SIZE}`,
                extract: (d) => Array.isArray(d) ? d : (Array.isArray(d?.items) ? d.items : []),
                section: App.createHomeSection({
                    id: 'trending',
                    title: 'Trending',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: false
                })
            },
            {
                path: `/comics/popular?period=Mingguan&limit=${PAGE_SIZE}`,
                extract: (d) => Array.isArray(d) ? d : (Array.isArray(d?.items) ? d.items : []),
                section: App.createHomeSection({
                    id: 'popular_today',
                    title: 'Popular',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: false
                })
            }
        ]

        for (const item of sections) {
            sectionCallback(item.section)
            try {
                const data = await this.apiGet(item.path)
                item.section.items = parseMangaList(item.extract(data))
                sectionCallback(item.section)
            } catch (error) {
                console.log(`Error loading section ${item.section.id}:`, error)
            }
        }
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const data = await this.apiGet('/comics/filters')
        return parseSearchTags(data)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = Number(metadata?.page ?? 1)
        const title = query.title?.trim() ?? ''
        const genres = getTagValues(query, 'genre:')
        const type = getTagValues(query, 'type:')[0]
        const status = getTagValues(query, 'status:')[0]

        if (title && !genres.length && !type && !status) {
            const data = await this.apiGet(`/comics/search?q=${encodeURIComponent(title)}&page=${page}&limit=${PAGE_SIZE}`)
            const raw = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : [])
            const results = parseMangaList(raw)
            return App.createPagedResults({
                results,
                metadata: raw.length >= PAGE_SIZE ? { page: page + 1 } : undefined
            })
        }

        const params: string[] = [`page=${page}`, `limit=${PAGE_SIZE}`]
        if (title) params.push(`q=${encodeURIComponent(title)}`)
        if (genres.length) params.push(`genres=${encodeURIComponent(genres.join(','))}`)
        if (type) params.push(`type=${encodeURIComponent(type)}`)
        if (status) params.push(`status=${encodeURIComponent(status)}`)

        const data = await this.apiGet(`/comics?${params.join('&')}`)
        const raw = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
        const results = parseMangaList(raw)
        const totalPages = Number(data?.totalPages ?? 0)
        const hasMore = totalPages > 0 ? page < totalPages : raw.length >= PAGE_SIZE

        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = Number(metadata?.page ?? 1)
        if (homepageSectionId !== 'latest_update') {
            throw new Error(`View more not supported for section: ${homepageSectionId}`)
        }

        const data = await this.apiGet(`/comics/latest-updates?page=${page}&limit=${PAGE_SIZE}`)
        const raw = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : [])
        const results = parseMangaList(raw)
        const totalPages = Number(data?.totalPages ?? 0)
        const hasMore = totalPages > 0 ? page < totalPages : raw.length >= PAGE_SIZE

        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }

    override async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: `${BASE_URL}/`,
            method: 'GET',
            headers: {
                'referer': `${BASE_URL}/`,
                'origin': `${BASE_URL}/`,
                'user-agent': await this.requestManager.getDefaultUserAgent()
            }
        })
    }

    override getMangaShareUrl(mangaId: string): string {
        return `${BASE_URL}/manga/${mangaId}`
    }
}
