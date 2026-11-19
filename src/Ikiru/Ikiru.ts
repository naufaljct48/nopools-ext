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
import { createRequestObject, PORTAL_URL, WEBSITE_BASE } from './IkiruHelper'
import {
    parseChapterDetails,
    parseChapterList,
    parseMangaDetails,
    parseMangaList,
    parseSearchTags
} from './IkiruParser'

const PAGE_SIZE = 24

const getIncludedTagsByPrefix = (query: SearchRequest, prefix: string): string[] => {
    const tags = (query as any)?.includedTags as Array<{ id: string }> | undefined
    if (!Array.isArray(tags)) return []

    const results: string[] = []
    for (const tag of tags) {
        const value = String(tag?.id ?? '')
        if (value.startsWith(prefix)) results.push(value.replace(prefix, ''))
    }
    return results
}

export const IkiruInfo: SourceInfo = {
    version: '3.0.0',
    name: 'Ikiru',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls manga from Ikiru (API-based)',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: WEBSITE_BASE,
    sourceTags: [{ text: 'Indonesian', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI
}

export class Ikiru extends Source {
    private activeBase: string = WEBSITE_BASE

    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test((request.url || '').split('?')[0] ?? '')
                const isApi = /\/api\//i.test(request.url || '')
                request.headers = {
                    ...(request.headers ?? {} as Record<string, string>),
                    'Accept': isApi
                        ? 'application/json, text/plain, */*'
                        : isImage
                            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Origin': this.activeBase,
                    'Referer': `${this.activeBase}/`,
                    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    private async discoverPortalBase(): Promise<string | null> {
        try {
            const req = createRequestObject({ url: PORTAL_URL, headers: { 'Accept': 'text/html,*/*' } }, this.activeBase)
            const res = await this.requestManager.schedule(req, 1)
            const html = String(res.data ?? '')
            const match = html.match(/https?:\/\/[a-z0-9.-]*ikiru\.wtf/i)
            return match ? match[0].replace(/\/+$/, '') : null
        } catch {
            return null
        }
    }

    private async apiGet(pathAndQuery: string): Promise<any> {
        const tryFetch = async (base: string): Promise<any> => {
            const req = createRequestObject({ url: `${base}${pathAndQuery}` }, base)
            const res = await this.requestManager.schedule(req, 1)
            if (res.status === 403 || res.status === 503) {
                throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${base}> and press the cloud icon.`)
            }
            const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            if (parsed && parsed.success === false) {
                throw new Error(`Ikiru API error: ${parsed.message ?? 'request failed'}`)
            }
            return parsed
        }

        try {
            return await tryFetch(this.activeBase)
        } catch (err: any) {
            if (String(err?.message ?? '').includes('CLOUDFLARE BYPASS') || String(err?.message ?? '').includes('Ikiru API error')) {
                throw err
            }
            const portalBase = await this.discoverPortalBase()
            if (portalBase && portalBase !== this.activeBase) {
                const res = await tryFetch(portalBase)
                this.activeBase = portalBase
                return res
            }
            throw err
        }
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const json = await this.apiGet(`/api/public/manga/${encodeURIComponent(mangaId)}`)
        return parseMangaDetails(json?.data ?? {}, mangaId, this.activeBase)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const allChapters: any[] = []
        let page = 1
        const maxPages = 30

        while (page <= maxPages) {
            const json = await this.apiGet(`/api/public/manga/${encodeURIComponent(mangaId)}/chapter?page=${page}&limit=100`)
            const batch = Array.isArray(json?.data?.chapters) ? json.data.chapters : []
            allChapters.push(...batch)
            if (!json?.data?.hasMore || batch.length === 0) break
            page++
        }

        return parseChapterList(allChapters, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const json = await this.apiGet(`/api/public/chapter/${encodeURIComponent(chapterId)}?mangaSlug=${encodeURIComponent(mangaId)}`)
        return parseChapterDetails(json?.data ?? {}, mangaId, chapterId, this.activeBase)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections: Array<{ path: string, extract: (json: any) => any[], section: HomeSection }> = [
            {
                path: '/api/public/manga/featured',
                extract: (j) => Array.isArray(j?.data) ? j.data : [],
                section: App.createHomeSection({
                    id: 'featured',
                    title: 'Featured',
                    type: HomeSectionType.featured,
                    containsMoreItems: false
                })
            },
            {
                path: `/api/public/manga/updated?page=1&limit=${PAGE_SIZE}`,
                extract: (j) => Array.isArray(j?.data) ? j.data : [],
                section: App.createHomeSection({
                    id: 'latest_update',
                    title: 'Latest Update',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                path: `/api/public/manga/project?page=1&limit=${PAGE_SIZE}`,
                extract: (j) => Array.isArray(j?.data?.project) ? j.data.project : [],
                section: App.createHomeSection({
                    id: 'project',
                    title: 'Project',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                path: `/api/public/manga/new?page=1&limit=${PAGE_SIZE}`,
                extract: (j) => Array.isArray(j?.data) ? j.data : [],
                section: App.createHomeSection({
                    id: 'new_titles',
                    title: 'New Series',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            }
        ]

        for (const item of sections) {
            sectionCallback(item.section)
            try {
                const json = await this.apiGet(item.path)
                item.section.items = parseMangaList(item.extract(json), this.activeBase)
                sectionCallback(item.section)
            } catch (error) {
                console.log(`Error loading section ${item.section.id}:`, error)
            }
        }
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const json = await this.apiGet('/api/user/genres')
        const allGenres = Array.isArray(json?.data?.allGenres) ? json.data.allGenres : []
        return parseSearchTags(allGenres)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = Number(metadata?.page ?? 1)
        const searchTerm = query.title?.trim() ?? ''
        const genres = getIncludedTagsByPrefix(query, 'genre:')
        const types = getIncludedTagsByPrefix(query, 'type:')
        const statuses = getIncludedTagsByPrefix(query, 'status:')

        // `/api/public/library/search` ignores queries shorter than 3 chars, while
        // `/api/public/manga/search?q=` supports 1-2 character queries
        if (searchTerm && searchTerm.length < 3 && !genres.length && !types.length && !statuses.length) {
            const json = await this.apiGet(`/api/public/manga/search?q=${encodeURIComponent(searchTerm)}&page=${page}&limit=${PAGE_SIZE}`)
            const rawList = Array.isArray(json?.data) ? json.data : []
            const results = parseMangaList(rawList, this.activeBase)
            return App.createPagedResults({
                results,
                metadata: rawList.length >= PAGE_SIZE ? { page: page + 1 } : undefined
            })
        }

        const params: string[] = [`page=${page}`, `limit=${PAGE_SIZE}`]
        if (searchTerm) params.push(`query=${encodeURIComponent(searchTerm)}`)
        for (const g of genres) params.push(`genre=${encodeURIComponent(g)}`)
        if (types[0]) params.push(`type=${encodeURIComponent(types[0])}`)
        if (statuses[0]) params.push(`status=${encodeURIComponent(statuses[0])}`)

        const json = await this.apiGet(`/api/public/library/search?${params.join('&')}`)
        const rawList = Array.isArray(json?.data?.mangas) ? json.data.mangas : []
        const results = parseMangaList(rawList, this.activeBase)
        const total = Number(json?.data?.total ?? 0)
        const hasMore = total > 0 ? page * PAGE_SIZE < total : rawList.length >= PAGE_SIZE

        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = Number(metadata?.page ?? 1)

        if (homepageSectionId === 'latest_update') {
            const json = await this.apiGet(`/api/public/library/search?page=${page}&limit=${PAGE_SIZE}`)
            const rawList = Array.isArray(json?.data?.mangas) ? json.data.mangas : []
            const results = parseMangaList(rawList, this.activeBase)
            const total = Number(json?.data?.total ?? 0)
            return App.createPagedResults({
                results,
                metadata: (total > 0 ? page * PAGE_SIZE < total : rawList.length >= PAGE_SIZE) ? { page: page + 1 } : undefined
            })
        }

        if (homepageSectionId === 'project') {
            const json = await this.apiGet(`/api/public/manga/project?page=${page}&limit=${PAGE_SIZE}`)
            const rawList = Array.isArray(json?.data?.project) ? json.data.project : []
            const results = parseMangaList(rawList, this.activeBase)
            const total = Number(json?.data?.total ?? 0)
            return App.createPagedResults({
                results,
                metadata: (total > 0 ? page * PAGE_SIZE < total : rawList.length >= PAGE_SIZE) ? { page: page + 1 } : undefined
            })
        }

        if (homepageSectionId === 'new_titles') {
            const json = await this.apiGet(`/api/public/manga/new?page=${page}&limit=${PAGE_SIZE}`)
            const rawList = Array.isArray(json?.data) ? json.data : []
            const results = parseMangaList(rawList, this.activeBase)
            return App.createPagedResults({
                results,
                metadata: rawList.length >= PAGE_SIZE ? { page: page + 1 } : undefined
            })
        }

        throw new Error(`View more not supported for section: ${homepageSectionId}`)
    }

    override async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: `${this.activeBase}/`,
            method: 'GET',
            headers: {
                'referer': `${this.activeBase}/`,
                'origin': `${this.activeBase}/`,
                'user-agent': await this.requestManager.getDefaultUserAgent()
            }
        })
    }

    override getMangaShareUrl(mangaId: string): string {
        return `${this.activeBase}/manga/${mangaId}`
    }
}
