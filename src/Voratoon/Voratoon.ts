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
    BASE_URL,
    createRequestObject,
    DEFAULT_RUN_API_ACTION,
    DEFAULT_UNLOCK_PAGES_ACTION,
    FALLBACK_BASES,
    isPresignExpired,
    parseFlightPayload,
    parseFlightResult,
    PORTAL_URL,
    PRESIGN_HOST
} from './VoratoonHelper'
import {
    parseChapterDetails,
    parseChapterList,
    parseMangaDetails,
    parseMangaList,
    parseSearchTags
} from './VoratoonParser'

const PAGE_SIZE = 24

export const VoratoonInfo: SourceInfo = {
    version: '1.1.0',
    name: 'Voratoon',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls manga from Voratoon (API-based)',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: BASE_URL,
    sourceTags: [{ text: 'Indonesian', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI
}

// Tag ids are prefixed per section (`genre:`, `status:`, `format:`) so one flat
// includedTags list can still be split back into the API's separate params
const getTagValues = (query: SearchRequest, prefix: string): string[] => {
    const tags = (query as any)?.includedTags as Array<{ id: string }> | undefined
    if (!Array.isArray(tags)) return []

    const values: string[] = []
    for (const tag of tags) {
        const value = String(tag?.id ?? '')
        if (value.startsWith(prefix)) values.push(value.replace(prefix, ''))
    }
    return values
}

export class Voratoon extends Source {
    private activeBase: string = BASE_URL
    private actionId: string = DEFAULT_RUN_API_ACTION
    private unlockActionId: string = DEFAULT_UNLOCK_PAGES_ACTION

    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                if (request.url.includes(PRESIGN_HOST) && isPresignExpired(request.url)) {
                    try {
                        const slug = request.url.match(/\/series\/([^/]+)\//)?.[1]
                        if (slug) {
                            const refreshed = await this.apiGet(`/series/${slug}`, { includeMeta: true })
                            const freshUrl = refreshed?.data?.data?.coverImage
                            if (freshUrl) request.url = freshUrl
                        }
                    } catch (error) {
                        console.log('Failed to refresh expired cover URL:', error)
                    }
                }

                // Covers are presigned S3 links, so the extension check must ignore the query string
                const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(request.url.split('?')[0] ?? '')

                request.headers = isImage ? {
                    ...(request.headers ?? {}),
                    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                    'Referer': `${this.activeBase}/`
                } : {
                    ...(request.headers ?? {}),
                    'Origin': this.activeBase,
                    'Referer': `${this.activeBase}/`,
                    'Sec-GPC': '1'
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    private async discoverPortalDomains(): Promise<string[]> {
        try {
            const response = await this.requestManager.schedule(createRequestObject({
                url: PORTAL_URL,
                method: 'GET',
                headers: { 'Accept': 'text/html,*/*' }
            }, this.activeBase), 1)
            const html = String(response.data ?? '')
            const matches = html.match(/https?:\/\/[a-z0-9.-]*voratoon\.[a-z]+/gi) ?? []
            const domains: string[] = []
            for (const m of matches) {
                const clean = m.replace(/\/+$/, '')
                if (!/voratoon\.id$/i.test(clean) && !domains.includes(clean)) domains.push(clean)
            }
            return domains
        } catch {
            return []
        }
    }

    private async refreshActionIdForBase(base: string): Promise<string | null> {
        try {
            const homeRes = await this.requestManager.schedule(createRequestObject({
                url: `${base}/`,
                method: 'GET',
                headers: { 'Accept': 'text/html,*/*' }
            }, base), 1)
            if (homeRes.status !== 200) return null
            const html = String(homeRes.data ?? '')
            const chunks = html.match(/\/_next\/static\/chunks\/[^"'<> ]+\.js/g) ?? []
            const seen: Record<string, boolean> = {}
            for (const chunk of chunks) {
                if (seen[chunk]) continue
                seen[chunk] = true
                // Skip large framework/react bundles
                if (/webpack|main-app|framework|polyfills|4bd1b696|3794/.test(chunk)) continue
                const chunkRes = await this.requestManager.schedule(createRequestObject({
                    url: `${base}${chunk}`,
                    method: 'GET',
                    headers: { 'Accept': '*/*' }
                }, base), 1)
                const js = String(chunkRes.data ?? '')
                const m = js.match(/createServerReference\)\("([0-9a-f]{32,})"[^)]*"runApiCalls"/)
                if (m?.[1]) return m[1]
            }
        } catch {
            // Try next mirror
        }
        return null
    }

    private async callServerAction(base: string, actionId: string, path: string, query?: Record<string, any>): Promise<any> {
        const callObj: Record<string, any> = { path, method: 'GET', token: null }
        if (query && Object.keys(query).length > 0) callObj.query = query

        const response = await this.requestManager.schedule(createRequestObject({
            url: `${base}/`,
            method: 'POST',
            headers: {
                'Accept': 'text/x-component',
                'Content-Type': 'text/plain;charset=UTF-8',
                'Next-Action': actionId
            },
            data: JSON.stringify([[callObj]])
        }, base), 1)

        if (response.status === 403 || response.status === 503) {
            throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${base}> and press the cloud icon.`)
        }
        if (response.status !== 200) return null

        return parseFlightResult(String(response.data ?? ''))
    }

    private async apiGet(path: string, query?: Record<string, any>): Promise<any> {
        // Fast path: active domain + cached server action id
        try {
            const res = await this.callServerAction(this.activeBase, this.actionId, path, query)
            if (res?.ok && res?.envelope) {
                if (res.envelope.status !== undefined && res.envelope.status !== 200) {
                    throw new Error(`Voratoon API error: ${res.envelope.message ?? 'unknown response'}`)
                }
                return res.envelope
            }
            if (res && res.ok === false) {
                throw new Error(`Voratoon API error: ${res.message ?? res.payload?.message ?? 'request failed'}`)
            }
        } catch (err: any) {
            if (String(err?.message ?? '').includes('CLOUDFLARE BYPASS') || String(err?.message ?? '').includes('Voratoon API error')) {
                throw err
            }
        }

        // Recovery path: refresh action id or switch to working mirror / portal domain
        const candidates: string[] = [this.activeBase]
        for (const fb of FALLBACK_BASES) {
            if (!candidates.includes(fb)) candidates.push(fb)
        }
        const portalDomains = await this.discoverPortalDomains()
        for (const pd of portalDomains) {
            if (!candidates.includes(pd)) candidates.push(pd)
        }

        for (const base of candidates) {
            const freshAction = await this.refreshActionIdForBase(base)
            const actionToUse = freshAction ?? this.actionId
            try {
                const res = await this.callServerAction(base, actionToUse, path, query)
                if (res?.ok && res?.envelope) {
                    this.activeBase = base
                    this.actionId = actionToUse
                    return res.envelope
                }
            } catch {
                // Try next candidate
            }
        }

        throw new Error(`Voratoon API error: unable to fetch ${path} from ${this.activeBase}`)
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const data = await this.apiGet(`/series/${mangaId}`, { includeMeta: true })
        return parseMangaDetails(data.data, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const data = await this.apiGet(`/series/${mangaId}/chapters`)
        return parseChapterList(data.data, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // chapterId is the chapter index, which is what the endpoint takes
        const data = await this.apiGet(`/series/${mangaId}/chapters/${chapterId}`)
        const chapterData = data?.data
        const existingImages = chapterData?.data?.images
        if (Array.isArray(existingImages) && existingImages.length > 0) {
            return parseChapterDetails(chapterData, mangaId, chapterId)
        }

        // Voratoon now issues a `pagesTicket` unlocked via the `unlockChapterPages` Server Action
        const ticket = chapterData?.pagesTicket
        if (typeof ticket === 'string' && ticket.length > 0) {
            const response = await this.requestManager.schedule(createRequestObject({
                url: `${this.activeBase}/series/${mangaId}/chapter/${chapterId}`,
                method: 'POST',
                headers: {
                    'Accept': 'text/x-component',
                    'Content-Type': 'text/plain;charset=UTF-8',
                    'Next-Action': this.unlockActionId
                },
                data: JSON.stringify([ticket])
            }, this.activeBase), 1)

            if (response.status === 403 || response.status === 503) {
                throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to <${this.activeBase}/series/${mangaId}/chapter/${chapterId}> and complete the verification.`)
            }

            const unlocked = parseFlightPayload(String(response.data ?? ''))
            if (unlocked?.ok && Array.isArray(unlocked.images) && unlocked.images.length > 0) {
                return parseChapterDetails({ data: { images: unlocked.images } }, mangaId, chapterId)
            }
            if (unlocked?.reason === 'challenge') {
                throw new Error(`CLOUDFLARE BYPASS ERROR:\nVoratoon requires Turnstile verification to read chapters. Open <${this.activeBase}> via the cloud icon, solve verification on any chapter, then retry.`)
            }
            throw new Error(`Voratoon unlockChapterPages error: ${unlocked?.message ?? 'unknown response'}`)
        }

        return parseChapterDetails(chapterData, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections: Array<{ path: string, query: Record<string, any>, section: HomeSection }> = [
            {
                path: '/series',
                query: { preset: 'banner', includeMeta: true },
                section: App.createHomeSection({
                    id: 'featured',
                    title: 'Featured',
                    type: HomeSectionType.featured,
                    containsMoreItems: false
                })
            },
            {
                path: '/series',
                query: { takeChapter: 2, includeMeta: true, sort: 'latest', sortOrder: 'desc', take: PAGE_SIZE, page: 1 },
                section: App.createHomeSection({
                    id: 'latest_update',
                    title: 'Latest Update',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                path: '/popular/all',
                query: { includeMeta: 1, take: PAGE_SIZE, page: 1 },
                section: App.createHomeSection({
                    id: 'popular',
                    title: 'Popular',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                path: '/series/recommendations',
                query: { take: 10, page: 1, method: 'all' },
                section: App.createHomeSection({
                    id: 'recommendations',
                    title: 'Recommendations',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            }
        ]

        for (const item of sections) {
            sectionCallback(item.section)

            try {
                const data = await this.apiGet(item.path, item.query)
                item.section.items = parseMangaList(data.data)
                sectionCallback(item.section)
            } catch (error) {
                console.log(`Error loading section ${item.section.id}:`, error)
            }
        }
    }

    override async getHomePageSection(sectionCallback: (section: HomeSection) => void): Promise<void> {
        return this.getHomePageSections(sectionCallback)
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const data = await this.apiGet('/genres')
        return parseSearchTags(data.data)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        const params: Record<string, any> = {
            page,
            take: PAGE_SIZE,
            includeMeta: true,
            sort: 'latest',
            sortOrder: 'desc'
        }

        const title = query.title?.trim()
        const genres = getTagValues(query, 'genre:')
        // `filter` is RSQL and only one expression is honoured, so a text query wins
        // over genre ids. Plain `genres=`/`genreIds=` params are silently ignored.
        if (title) {
            params.filter = `title=like="${title}",nativeTitle=like="${title}"`
        } else if (genres.length) {
            params.filter = `genreIds=in=(${genres.join(',')})`
        }

        const status = getTagValues(query, 'status:')[0]
        if (status) params.status = status
        const format = getTagValues(query, 'format:')[0]
        if (format) params.format = format

        const data = await this.apiGet('/series', params)
        const results = parseMangaList(data.data)

        return App.createPagedResults({
            results,
            metadata: results.length >= PAGE_SIZE ? { page: page + 1 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1

        let path: string
        let query: Record<string, any>
        switch (homepageSectionId) {
            case 'latest_update':
                path = '/series'
                query = { takeChapter: 2, includeMeta: true, sort: 'latest', sortOrder: 'desc', take: PAGE_SIZE, page }
                break
            case 'popular':
                path = '/popular/all'
                query = { includeMeta: 1, take: PAGE_SIZE, page }
                break
            case 'recommendations':
                path = '/series/recommendations'
                query = { take: PAGE_SIZE, page, method: 'all' }
                break
            default:
                throw new Error(`View more not supported for section: ${homepageSectionId}`)
        }

        const data = await this.apiGet(path, query)
        const results = parseMangaList(data.data)

        return App.createPagedResults({
            results,
            metadata: results.length >= PAGE_SIZE ? { page: page + 1 } : undefined
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

    override getCloudflareBypassRequest(): Request {
        return App.createRequest({
            url: `${this.activeBase}/`,
            method: 'GET',
            headers: {
                'referer': `${this.activeBase}/`,
                'origin': `${this.activeBase}/`
            }
        })
    }

    override getMangaShareUrl(mangaId: string): string {
        return `${this.activeBase}/series/${mangaId}`
    }
}
