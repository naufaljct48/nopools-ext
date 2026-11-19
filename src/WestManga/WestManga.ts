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
import { createRequestObject, FALLBACK_BASES, PORTAL_URL, WEBSITE_BASE } from './WestMangaHelper'
import { parseChapterDetails, parseChapterList, parseMangaDetails, parseMangaList, parseSearchTags } from './WestMangaParser'

export const WestMangaInfo: SourceInfo = {
    version: '1.2.0',
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
    private activeBase: string = WEBSITE_BASE
    private visitToken: string | null = null
    private visitExpiresAt = 0

    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /(\.(png|jpe?g|webp|gif|avif)$)|\/img\/|storage\./i.test((request.url || '').split('?')[0] ?? '')
                const isApi = /\/api\//i.test(request.url)
                request.headers = {
                    ...(request.headers ?? {} as Record<string, string>),
                    'Accept': isApi
                        ? 'application/json, text/plain, */*'
                        : isImage
                            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Origin': this.activeBase,
                    'Referer': `${this.activeBase}/`,
                    'DNT': '1',
                    'Sec-GPC': '1',
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

    private parseJSON(response: Response): any {
        const data = response?.data
        if (!data) return {}
        try {
            return typeof data === 'string' ? JSON.parse(data) : data
        } catch {
            return {}
        }
    }

    private async discoverPortalDomains(): Promise<string[]> {
        try {
            const req = createRequestObject({ url: PORTAL_URL, method: 'GET' }, this.activeBase)
            const res = await this.requestManager.schedule(req, 1)
            const html = String(res.data ?? '')
            const matches = html.match(/https?:\/\/[a-z0-9.-]*westmanga\.[a-z]+/gi) ?? []
            const out: string[] = []
            for (const m of matches) {
                const clean = m.replace(/\/+$/, '')
                if (!/westmanga\.site$/i.test(clean) && !out.includes(clean)) out.push(clean)
            }
            return out
        } catch {
            return []
        }
    }

    private async fetchVisitTokenForBase(base: string): Promise<{ token: string, expiresAt: number } | null> {
        try {
            const req = createRequestObject({ url: `${base}/api/visit-token`, method: 'GET' }, base)
            const res = await this.requestManager.schedule(req, 1)
            if (res.status !== 200) return null
            const json = this.parseJSON(res)
            if (typeof json?.token === 'string' && json.token) {
                return { token: json.token, expiresAt: Number(json.expires_at ?? 0) }
            }
        } catch {
            // Try next mirror
        }
        return null
    }

    private async ensureVisitToken(forceRefresh = false): Promise<string> {
        const nowSec = Math.floor(Date.now() / 1000)
        if (!forceRefresh && this.visitToken && (this.visitExpiresAt === 0 || this.visitExpiresAt - nowSec > 300)) {
            return this.visitToken
        }

        const candidates: string[] = [this.activeBase]
        for (const fb of FALLBACK_BASES) {
            if (!candidates.includes(fb)) candidates.push(fb)
        }

        for (const base of candidates) {
            const result = await this.fetchVisitTokenForBase(base)
            if (result) {
                this.activeBase = base
                this.visitToken = result.token
                this.visitExpiresAt = result.expiresAt
                return result.token
            }
        }

        const portalDomains = await this.discoverPortalDomains()
        for (const base of portalDomains) {
            if (candidates.includes(base)) continue
            const result = await this.fetchVisitTokenForBase(base)
            if (result) {
                this.activeBase = base
                this.visitToken = result.token
                this.visitExpiresAt = result.expiresAt
                return result.token
            }
        }

        throw new Error(`Failed to obtain WestManga visit token from ${this.activeBase}`)
    }

    private async apiGet(pathAndQuery: string): Promise<any> {
        for (let attempt = 0; attempt < 2; attempt++) {
            const token = await this.ensureVisitToken(attempt > 0)
            const req = createRequestObject({
                url: `${this.activeBase}${pathAndQuery}`,
                method: 'GET',
                headers: { 'X-WM-Visit': token }
            }, this.activeBase)
            const res = await this.requestManager.schedule(req, 1)
            if (res.status === 403 && attempt === 0) {
                this.visitToken = null
                this.visitExpiresAt = 0
                continue
            }
            if (res.status === 403 || res.status === 503) {
                throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${this.activeBase}> and press the cloud icon.`)
            }
            return this.parseJSON(res)
        }
        return {}
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const json = await this.apiGet(`/api/comic/${mangaId}`)
        return parseMangaDetails(json, mangaId, this.activeBase)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const json = await this.apiGet(`/api/comic/${mangaId}`)
        return parseChapterList(json)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const slug = chapterId.replace(/^\/?v\//, '')
        const json = await this.apiGet(`/api/v/${slug}`)
        return parseChapterDetails(json, mangaId, chapterId, this.activeBase)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections: { path: string, section: HomeSection }[] = [
            {
                path: '/api/contents?page=1&per_page=25&orderBy=Popular&project=false',
                section: App.createHomeSection({ id: 'popular_today', title: 'Popular Today', type: HomeSectionType.singleRowNormal, containsMoreItems: true })
            },
            {
                path: '/api/contents?page=1&per_page=25&project=false',
                section: App.createHomeSection({ id: 'latest_update', title: 'Latest Update', type: HomeSectionType.singleRowNormal, containsMoreItems: true })
            }
        ]

        for (const s of sections) {
            sectionCallback(s.section)
            const json = await this.apiGet(s.path)
            s.section.items = parseMangaList(json, this.activeBase)
            sectionCallback(s.section)
        }
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const json = await this.apiGet('/api/contents/genres')
        return parseSearchTags(json)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = Number(metadata?.page ?? 1)
        const title = query.title?.trim()
        const params: string[] = [`page=${page}`, 'per_page=25', 'project=false']
        if (title) params.push(`q=${encodeURIComponent(title)}`)
        const included = (query as any)?.includedTags as Array<{ id: string }>
        if (Array.isArray(included) && included.length) {
            for (const tag of included) {
                const id = String(tag?.id ?? '').trim()
                if (id) params.push(`genre%5B%5D=${encodeURIComponent(id)}`)
            }
        }
        const json = await this.apiGet(`/api/contents?${params.join('&')}`)
        const results = parseMangaList(json, this.activeBase)
        const current = Number(json?.paginator?.current_page ?? page)
        const last = Number(json?.paginator?.last_page ?? page)
        return App.createPagedResults({ results, metadata: current < last ? { page: current + 1, last } : undefined })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = Number(metadata?.page ?? 1)
        const params: string[] = [`page=${page}`, 'per_page=25', 'project=false']
        if (homepageSectionId === 'popular_today') params.push('orderBy=Popular')
        else if (homepageSectionId !== 'latest_update') throw new Error(`Invalid homepage section id: ${homepageSectionId}`)

        const json = await this.apiGet(`/api/contents?${params.join('&')}`)
        const results = parseMangaList(json, this.activeBase)
        const current = Number(json?.paginator?.current_page ?? page)
        const last = Number(json?.paginator?.last_page ?? page)
        return App.createPagedResults({ results, metadata: current < last ? { page: current + 1, last } : undefined })
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
