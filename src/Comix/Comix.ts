import {
    BadgeColor,
    Chapter,
    ChapterDetails,
    ContentRating,
    DUISection,
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
    BASE_URL,
    createRequestObject
} from './ComixHelper'
import {
    parseChapterDetails,
    parseChapterList,
    parseMangaDetails,
    parseMangaList,
    parseSearchTags
} from './ComixParser'

/**
 * Bookmarklet yang user bisa save sebagai bookmark di Safari.
 * Saat dijalankan di halaman comix.to, script ini intercept
 * XHR/fetch requests dan capture token `_` dari URL chapters API.
 *
 * Cara pakai:
 * 1. Buat bookmark baru di Safari, isi URL dengan code di bawah
 * 2. Buka comix.to/title/{any-manga}
 * 3. Tap bookmark tadi
 * 4. Token muncul di layar, copy paste ke Settings
 */
const BOOKMARKLET_CODE = "javascript:void((function(){var o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){if(u&&u.indexOf('/chapters')>-1){var t=(u.match(/[?&]_=([^&]+)/)||[])[1];if(t){prompt('Copy this token:',t)}}return o.apply(this,arguments)};var f=window.fetch;window.fetch=function(u,opts){var url=typeof u==='string'?u:u.url;if(url&&url.indexOf('/chapters')>-1){var t=(url.match(/[?&]_=([^&]+)/)||[])[1];if(t){prompt('Copy this token:',t)}}return f.apply(this,arguments)};alert('Token interceptor active! Now scroll down to load chapters, or refresh the page.')})())"

export const ComixInfo: SourceInfo = {
    version: '1.3.1',
    name: 'Comix.to',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls comics from Comix.to',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: BASE_URL,
    sourceTags: [{ text: 'English', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

export class Comix extends Source {

    stateManager = App.createSourceStateManager()

    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => request,
            interceptResponse: async (response: Response): Promise<Response> => response
        }
    })

    // ========================= Settings UI =========================

    override async getSourceMenu(): Promise<DUISection> {
        return App.createDUISection({
            id: 'main',
            header: 'Source Settings',
            isHidden: false,
            rows: async () => [
                App.createDUIInputField({
                    id: 'api_token',
                    label: 'API Token (_)',
                    value: App.createDUIBinding({
                        get: async () => await this.stateManager.retrieve('api_token') ?? '',
                        set: async (value: string) => await this.stateManager.store('api_token', value.trim())
                    })
                }),
                App.createDUILabel({
                    id: 'token_help',
                    label: 'Paste your token above. To get it:'
                }),
                App.createDUILabel({
                    id: 'token_step1',
                    label: '1. Open Safari → go to comix.to and open any manga page'
                }),
                App.createDUILabel({
                    id: 'token_step2',
                    label: '2. Tap the URL bar → paste this bookmarklet (see step 3)'
                }),
                App.createDUILabel({
                    id: 'token_step3',
                    label: '3. Create a bookmark with this URL as the address:'
                }),
                App.createDUILabel({
                    id: 'token_bookmarklet',
                    label: BOOKMARKLET_CODE
                }),
                App.createDUILabel({
                    id: 'token_step4',
                    label: '4. The token will appear on screen — long press to copy, then paste above'
                }),
                App.createDUIButton({
                    id: 'try_auto_token',
                    label: 'Try Auto-Capture Token (after CF bypass)',
                    onTap: async () => {
                        await this.tryAutoCapture()
                    }
                })
            ]
        })
    }

    /**
     * Attempt to auto-capture token by fetching a manga page after CF bypass
     * and looking for token in the response or script tags.
     * This is a best-effort approach — may not always work.
     */
    private async tryAutoCapture(): Promise<void> {
        try {
            const response = await this.requestManager.schedule(
                createRequestObject({
                    url: `${BASE_URL}/title/93q1r-the-summoner-apocalypse-rewinds`,
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    }
                }),
                1
            )
            const html = response.data as string ?? ''

            // Try to find token in any inline script or XHR URL
            const tokenMatch = html.match(/[?&]_=([\w\-_.]+)/)
            if (tokenMatch?.[1]) {
                await this.stateManager.store('api_token', tokenMatch[1])
                console.log('[Comix] Auto-captured token successfully!')
                return
            }

            // Try meta[name=cfg] — won't decode but worth logging
            const cfgMatch = html.match(/<meta[^>]+name=["']cfg["'][^>]+content=["']([^"']+)["']/)
            if (cfgMatch) {
                console.log('[Comix] Found meta cfg but cannot decode without JS runtime')
            }

            console.log('[Comix] Auto-capture failed — token not found in HTML. Use bookmarklet method.')
        } catch (e) {
            console.log('[Comix] Auto-capture error:', e)
        }
    }

    // ========================= API Helpers =========================

    private async getToken(): Promise<string> {
        const token = await this.stateManager.retrieve('api_token') as string
        if (!token) {
            throw new Error(
                '[Comix] API Token required!\n\n' +
                'Go to Source Settings and paste your token.\n' +
                'How: Open comix.to → DevTools → Network → filter "chapters" → copy `_` param value.'
            )
        }
        return token
    }

    private async getJSON(url: string): Promise<any> {
        const response = await this.requestManager.schedule(
            createRequestObject({ url, method: 'GET' }),
            1
        )
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data

        // Handle API error responses
        if (data?.status === 'error') {
            const msg = data.message ?? 'Unknown API error'
            if (msg.toLowerCase().includes('token') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('forbidden')) {
                throw new Error('[Comix] Token expired or invalid. Please update your token in Source Settings.')
            }
            throw new Error(`[Comix] API Error: ${msg}`)
        }

        // Unwrap { status: 'ok', result: ... }
        if (data?.status === 'ok' && 'result' in data) return data.result
        return data
    }

    // ========================= Manga Details =========================

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const data = await this.getJSON(`${API_URL}/manga/${mangaId}`)
        return parseMangaDetails(data, mangaId)
    }

    // ========================= Chapters =========================

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const token = await this.getToken()

        const allChapters: any[] = []
        let page = 1
        let hasMore = true

        while (hasMore) {
            const url = `${API_URL}/manga/${mangaId}/chapters?page=${page}&limit=100&order%5Bnumber%5D=desc&_=${encodeURIComponent(token)}`
            const data = await this.getJSON(url)
            const items: any[] = data?.items ?? []
            allChapters.push(...items)

            // Pagination check
            const meta = data?.meta ?? data?.pagination
            const lastPage = meta?.lastPage ?? meta?.last_page ?? 1
            hasMore = page < lastPage && items.length > 0
            page++
        }

        if (allChapters.length === 0) {
            throw new Error('[Comix] No chapters found. Token might be expired — update it in Source Settings.')
        }

        return parseChapterList({ items: allChapters })
    }

    // ========================= Chapter Details (Pages) =========================

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const token = await this.getToken()
        const data = await this.getJSON(`${API_URL}/chapters/${chapterId}?_=${encodeURIComponent(token)}`)
        return parseChapterDetails(data, mangaId, chapterId)
    }

    // ========================= Homepage =========================

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                id: 'featured',
                title: 'Trending This Week',
                url: `${API_URL}/manga/top?type=trending&days=7&limit=20&content_rating=suggestive`,
                type: HomeSectionType.featured
            },
            {
                id: 'latest',
                title: 'Latest Updates',
                url: `${API_URL}/manga?order%5Bchapter_updated_at%5D=desc&content_rating=suggestive&page=1&limit=24`,
                type: HomeSectionType.singleRowNormal
            },
            {
                id: 'most_follows',
                title: 'Most Followed',
                url: `${API_URL}/manga/top?type=follows&days=7&limit=20&content_rating=suggestive`,
                type: HomeSectionType.singleRowNormal
            },
            {
                id: 'top_rated',
                title: 'Top Rated',
                url: `${API_URL}/manga?order%5Bscore%5D=desc&content_rating=suggestive&page=1&limit=24`,
                type: HomeSectionType.singleRowNormal
            }
        ]

        for (const s of sections) {
            const section = App.createHomeSection({
                id: s.id,
                title: s.title,
                type: s.type,
                containsMoreItems: s.type !== HomeSectionType.featured
            })
            sectionCallback(section)

            try {
                section.items = parseMangaList(await this.getJSON(s.url))
                sectionCallback(section)
            } catch (e) {
                console.log(`[Comix] Error loading section ${s.id}:`, e)
            }
        }
    }

    // ========================= Search =========================

    override async getSearchTags(): Promise<TagSection[]> {
        return parseSearchTags()
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const params: string[] = [`page=${page}`, 'limit=28']

        if (query.title) {
            params.push(`keyword=${encodeURIComponent(query.title)}`)
            params.push('order%5Brelevance%5D=desc')
        } else {
            params.push('order%5Bchapter_updated_at%5D=desc')
        }

        params.push('content_rating=suggestive')

        for (const tag of query.includedTags ?? []) {
            const colonIdx = tag.id.indexOf(':')
            if (colonIdx === -1) continue
            const key = tag.id.substring(0, colonIdx)
            const value = tag.id.substring(colonIdx + 1)

            if (key === 'genres_in') {
                params.push(`genres_in%5B%5D=${encodeURIComponent(value)}`)
            } else if (key === 'types') {
                params.push(`types%5B%5D=${encodeURIComponent(value)}`)
            } else if (key === 'statuses') {
                params.push(`statuses%5B%5D=${encodeURIComponent(value)}`)
            } else if (key === 'content_rating') {
                const idx = params.findIndex(p => p.startsWith('content_rating='))
                if (idx !== -1) params.splice(idx, 1)
                params.push(`content_rating=${encodeURIComponent(value)}`)
            }
        }

        const data = await this.getJSON(`${API_URL}/manga?${params.join('&')}`)
        const results = parseMangaList(data)
        const meta = data?.meta ?? data?.pagination
        const lastPage = meta?.lastPage ?? meta?.last_page ?? 1

        return App.createPagedResults({
            results,
            metadata: page < lastPage ? { page: page + 1 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const urlMap: Record<string, string> = {
            latest: `${API_URL}/manga?order%5Bchapter_updated_at%5D=desc&content_rating=suggestive&page=${page}&limit=28`,
            most_follows: `${API_URL}/manga/top?type=follows&days=7&limit=28&content_rating=suggestive&page=${page}`,
            top_rated: `${API_URL}/manga?order%5Bscore%5D=desc&content_rating=suggestive&page=${page}&limit=28`
        }

        const url = urlMap[homepageSectionId]
        if (!url) throw new Error(`View more not supported for section: ${homepageSectionId}`)

        const data = await this.getJSON(url)
        const results = parseMangaList(data)
        const meta = data?.meta ?? data?.pagination
        const lastPage = meta?.lastPage ?? meta?.last_page ?? 1

        return App.createPagedResults({
            results,
            metadata: page < lastPage ? { page: page + 1 } : undefined
        })
    }

    // ========================= Cloudflare =========================

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
        return `${BASE_URL}/title/${mangaId}`
    }
}
