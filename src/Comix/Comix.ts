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
    createHtmlRequestObject,
    createRequestObject
} from './ComixHelper'
import {
    parseChapterDetails,
    parseChapterDetailsFromHtml,
    parseChapterList,
    parseChapterListFromHtml,
    parseMangaDetails,
    parseMangaList,
    parseSearchTags
} from './ComixParser'

export const ComixInfo: SourceInfo = {
    version: '1.2.0',
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
    /**
     * Token `_` untuk chapter API.
     *
     * Comix.to melindungi endpoint /chapters dengan token yang di-generate
     * oleh JavaScript browser (VM-obfuscated, tidak bisa di-reverse).
     * Tachiyomi menggunakan Android WebView untuk intercept request JS dan
     * capture token — Paperback tidak punya API setara.
     *
     * Cara dapat token:
     * 1. Buka comix.to/title/{manga-id} di browser
     * 2. Buka DevTools → Network → filter "chapters"
     * 3. Copy nilai query param `_` dari URL request
     * 4. Paste ke Source Settings → API Token
     *
     * Token valid selama cf_clearance session aktif (~beberapa jam).
     */
    private get apiToken(): string {
        return (this.stateManager as any)?.retrieve?.('api_token') ?? ''
    }

    stateManager = App.createSourceStateManager()

    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => request,
            interceptResponse: async (response: Response): Promise<Response> => response
        }
    })

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
                    label: 'Cara dapat token: Buka comix.to di browser → DevTools → Network → filter "chapters" → copy nilai `_` dari URL request'
                })
            ]
        })
    }

    private async getJSON(url: string): Promise<any> {
        const response = await this.requestManager.schedule(
            createRequestObject({ url, method: 'GET' }),
            1
        )
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
        if (data?.status === 'ok' && 'result' in data) return data.result
        if (data?.status === 'error') throw new Error(data.message ?? 'Comix API error')
        return data
    }

    private async getHtml(url: string): Promise<string> {
        const response = await this.requestManager.schedule(
            createHtmlRequestObject({ url, method: 'GET' }),
            1
        )
        return response.data as string
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        return parseMangaDetails(await this.getJSON(`${API_URL}/manga/${mangaId}`), mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const token = await this.stateManager.retrieve('api_token') as string ?? ''

        if (token) {
            try {
                const allChapters: any[] = []
                let page = 1
                let hasMore = true

                while (hasMore) {
                    const url = `${API_URL}/manga/${mangaId}/chapters?page=${page}&limit=100&order%5Bnumber%5D=desc&_=${token}`
                    const data = await this.getJSON(url)
                    const items: any[] = data?.items ?? []
                    allChapters.push(...items)

                    const meta = data?.meta ?? data?.pagination
                    const lastPage = meta?.lastPage ?? meta?.last_page ?? 1
                    hasMore = page < lastPage && items.length > 0
                    page++
                }

                if (allChapters.length > 0) {
                    return parseChapterList({ items: allChapters })
                }
            } catch (e) {
                console.log('[Comix] Token invalid/expired, falling back to HTML scrape:', e)
            }
        }

        // Fallback: scrape dari HTML (butuh CF bypass aktif, dapat ~20 chapter per page)
        // HTML chapter list di-render oleh React — hanya tersedia via rendered WebView
        const html = await this.getHtml(`${BASE_URL}/title/${mangaId}`)
        return parseChapterListFromHtml(html, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const token = await this.stateManager.retrieve('api_token') as string ?? ''

        if (token) {
            try {
                const data = await this.getJSON(`${API_URL}/chapters/${chapterId}?_=${token}`)
                return parseChapterDetails(data, mangaId, chapterId)
            } catch (e) {
                console.log('[Comix] Token invalid for chapter details, falling back:', e)
            }
        }

        // Fallback: scrape pages dari HTML halaman chapter
        try {
            const mangaData = await this.getJSON(`${API_URL}/manga/${mangaId}`)
            const mangaUrl = mangaData?.url ?? ''
            const slug = mangaUrl.split('/title/')?.[1] ?? mangaId
            const html = await this.getHtml(`${BASE_URL}/title/${slug}/${chapterId}-chapter-0`)
            return parseChapterDetailsFromHtml(html, mangaId, chapterId)
        } catch {
            return App.createChapterDetails({ id: chapterId, mangaId, pages: [] })
        }
    }

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
