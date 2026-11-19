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
import { BASE_URL, createRequestObject, PORTAL_URL } from './AinzScanHelper'
import {
    parseChapterDetails,
    parseChapterList,
    parseMangaDetails,
    parseMangaList,
    parseSearchTags
} from './AinzScanParser'

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

export const AinzScanInfo: SourceInfo = {
    version: '4.0.0',
    name: 'AinzScans',
    description: `Extension that pulls manga from ${BASE_URL} (API-based)`,
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    icon: 'icon.jpg',
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

export class AinzScan extends Source {
    private activeBase: string = BASE_URL

    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test((request.url || '').split('?')[0] ?? '')
                request.headers = {
                    ...(request.headers ?? {}),
                    'Referer': `${this.activeBase}/`,
                    ...(isImage ? { 'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' } : {})
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
            const match = html.match(/https?:\/\/v\d+\.ainzscans\d*\.[a-z]+/i)
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
            return typeof res.data === 'string' ? JSON.parse(res.data) : res.data
        }

        try {
            return await tryFetch(this.activeBase)
        } catch (err: any) {
            if (String(err?.message ?? '').includes('CLOUDFLARE BYPASS')) throw err
            const portalBase = await this.discoverPortalBase()
            if (portalBase && portalBase !== this.activeBase) {
                const data = await tryFetch(portalBase)
                this.activeBase = portalBase
                return data
            }
            throw err
        }
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const data = await this.apiGet(`/api/series/comic/${encodeURIComponent(mangaId)}`)
        return parseMangaDetails(data, mangaId, this.activeBase)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const allUnits: any[] = []
        let page = 1
        const limit = 100
        const maxPages = 30

        while (page <= maxPages) {
            const data = await this.apiGet(`/api/series/comic/${encodeURIComponent(mangaId)}/chapters?page=${page}&limit=${limit}`)
            const batch = Array.isArray(data?.units) ? data.units : []
            allUnits.push(...batch)
            const pageLimit = Number(data?.limit ?? limit)
            if (batch.length === 0 || batch.length < pageLimit) break
            page++
        }

        return parseChapterList(allUnits, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const data = await this.apiGet(`/api/series/comic/${encodeURIComponent(mangaId)}/chapter/${encodeURIComponent(chapterId)}`)
        return parseChapterDetails(data, mangaId, chapterId, this.activeBase)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections: Array<{ path: string, section: HomeSection }> = [
            {
                path: `/api/search?type=COMIC&limit=${PAGE_SIZE}&page=1&sort=popular&order=desc`,
                section: App.createHomeSection({
                    id: 'popular_today',
                    title: 'Popular',
                    type: HomeSectionType.featured,
                    containsMoreItems: true
                })
            },
            {
                path: `/api/search?type=COMIC&limit=${PAGE_SIZE}&page=1&sort=latest&order=desc`,
                section: App.createHomeSection({
                    id: 'latest_update',
                    title: 'Latest Updates',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            }
        ]

        for (const item of sections) {
            sectionCallback(item.section)
            try {
                const json = await this.apiGet(item.path)
                item.section.items = parseMangaList(json?.data ?? [], this.activeBase)
                sectionCallback(item.section)
            } catch (error) {
                console.log(`Error loading section ${item.section.id}:`, error)
            }
        }
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const genres = await this.apiGet('/api/genres')
        return parseSearchTags(genres)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = Number(metadata?.page ?? 1)
        const sort = getTagValues(query, 'sort:')[0] || 'latest'
        const order = sort === 'az' ? 'asc' : 'desc'

        const params: string[] = [
            'type=COMIC',
            `limit=${PAGE_SIZE}`,
            `page=${page}`,
            `sort=${encodeURIComponent(sort)}`,
            `order=${order}`
        ]

        const title = query.title?.trim()
        if (title) params.push(`q=${encodeURIComponent(title)}`)

        const genre = getTagValues(query, 'genre:')[0]
        if (genre) params.push(`genre=${encodeURIComponent(genre)}`)

        const status = getTagValues(query, 'status:')[0]
        if (status) params.push(`status=${encodeURIComponent(status)}`)

        const json = await this.apiGet(`/api/search?${params.join('&')}`)
        const results = parseMangaList(json?.data ?? [], this.activeBase)
        const totalPages = Number(json?.total_pages ?? 0)
        const hasMore = totalPages > 0 ? page < totalPages : results.length >= PAGE_SIZE

        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = Number(metadata?.page ?? 1)
        let sort = 'latest'
        if (homepageSectionId === 'popular_today') sort = 'popular'
        else if (homepageSectionId !== 'latest_update') {
            throw new Error(`View more not supported for section: ${homepageSectionId}`)
        }

        const json = await this.apiGet(`/api/search?type=COMIC&limit=${PAGE_SIZE}&page=${page}&sort=${sort}&order=desc`)
        const results = parseMangaList(json?.data ?? [], this.activeBase)
        const totalPages = Number(json?.total_pages ?? 0)
        const hasMore = totalPages > 0 ? page < totalPages : results.length >= PAGE_SIZE

        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
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
        return `${this.activeBase}/comic/${mangaId}`
    }
}
