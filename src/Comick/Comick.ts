import {
    BadgeColor,
    Chapter,
    ChapterDetails,
    ContentRating,
    DUINavigationButton,
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
    SourceStateManager,
    TagSection
} from '@paperback/types'

import {
    createRequestObject,
    DEFAULT_DOMAIN,
    DEFAULT_LANGUAGE,
    DOMAINS,
    LANGUAGES,
    refererFor
} from './ComickHelper'
import {
    parseChapterDetails,
    parseChapterList,
    parseMangaDetails,
    parseMangaList,
    parseSearchTags
} from './ComickParser'

const SEARCH_PAGE_SIZE = 30
const UPDATES_PAGE_SIZE = 100
const MAX_CHAPTER_PAGES = 25

export const ComickInfo: SourceInfo = {
    version: '1.0.0',
    name: 'Comick',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls comics from Comick (multi-language, comick.live with comick.art fallback)',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: DEFAULT_DOMAIN,
    sourceTags: [
        { text: 'Multi-Language', type: BadgeColor.BLUE }
    ],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI
}

const getTagValues = (query: SearchRequest, prefix: string): string[] => {
    const tags = (query as any)?.includedTags as Array<{ id: string }> | undefined
    if (!Array.isArray(tags)) return []

    const values: string[] = []
    for (const tag of tags) {
        const value = String(tag?.id ?? '')
        if (value.startsWith(`${prefix}:`)) values.push(value.replace(`${prefix}:`, ''))
    }
    return values
}

export class Comick extends Source {
    stateManager = App.createSourceStateManager()

    requestManager = App.createRequestManager({
        requestsPerSecond: 1,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                // Covers and pages live on cdn1.comicknew.pictures, which 403s unless the
                // Referer is one of the site domains
                request.headers = {
                    ...(request.headers ?? {}),
                    'Referer': refererFor(request.url),
                    'user-agent': await this.requestManager.getDefaultUserAgent()
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    // ----SETTINGS----

    async getBaseUrl(): Promise<string> {
        return await this.stateManager.retrieve('domain') ?? DEFAULT_DOMAIN
    }

    async getLanguage(): Promise<string> {
        return await this.stateManager.retrieve('language') ?? DEFAULT_LANGUAGE
    }

    async getSourceMenu(): Promise<DUISection> {
        return App.createDUISection({
            id: 'sourceMenu',
            header: 'Source Menu',
            isHidden: false,
            rows: async () => [this.sourceSettings(this.stateManager)]
        })
    }

    sourceSettings = (stateManager: SourceStateManager): DUINavigationButton => {
        return App.createDUINavigationButton({
            id: 'comick_settings',
            label: 'Source Settings',
            form: App.createDUIForm({
                sections: async () => [
                    App.createDUISection({
                        id: 'language_section',
                        isHidden: false,
                        footer: 'Chapters are only listed in the selected language.',
                        rows: async () => [
                            App.createDUISelect({
                                id: 'language',
                                label: 'Chapter language',
                                options: Object.keys(LANGUAGES),
                                labelResolver: async (option) => LANGUAGES[option] ?? option,
                                value: App.createDUIBinding({
                                    get: async () => [await stateManager.retrieve('language') ?? DEFAULT_LANGUAGE],
                                    set: async (newValue) => await stateManager.store('language', (newValue as string[])[0] ?? DEFAULT_LANGUAGE)
                                }),
                                allowsMultiselect: false
                            })
                        ]
                    }),
                    App.createDUISection({
                        id: 'domain_section',
                        isHidden: false,
                        footer: 'Both domains serve the same site. Switch if one of them is blocked for you.',
                        rows: async () => [
                            App.createDUISelect({
                                id: 'domain',
                                label: 'Domain',
                                options: DOMAINS,
                                labelResolver: async (option) => option.replace('https://', ''),
                                value: App.createDUIBinding({
                                    get: async () => [await stateManager.retrieve('domain') ?? DEFAULT_DOMAIN],
                                    set: async (newValue) => await stateManager.store('domain', (newValue as string[])[0] ?? DEFAULT_DOMAIN)
                                }),
                                allowsMultiselect: false
                            })
                        ]
                    })
                ]
            })
        })
    }

    // ----REQUESTS----

    /**
     * comick.live and comick.art are the same site behind different domains, and each
     * one is intermittently Cloudflare-gated. Try the configured domain first, then the
     * other one before giving up.
     */
    private async fetch(path: string): Promise<Response> {
        const preferred = await this.getBaseUrl()
        const domains = [preferred, ...DOMAINS.filter(domain => domain !== preferred)]

        let lastError: unknown
        for (const domain of domains) {
            try {
                const response = await this.requestManager.schedule(createRequestObject({ url: `${domain}${path}` }), 1)
                if (response.status === 403 || response.status === 503) {
                    lastError = new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${domain}> and press the cloud icon.`)
                    continue
                }
                if (response.status >= 400) {
                    lastError = new Error(`Request to ${domain}${path} failed with status ${response.status}`)
                    continue
                }
                return response
            } catch (error) {
                lastError = error
            }
        }

        throw lastError instanceof Error ? lastError : new Error(`Request failed: ${path}`)
    }

    private async fetchJson(path: string): Promise<any> {
        const response = await this.fetch(path)
        return JSON.parse(response.data as string)
    }

    // ----PAPERBACK METHODS----

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const response = await this.fetch(`/comic/${encodeURIComponent(mangaId)}`)
        return parseMangaDetails(response.data as string, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const language = await this.getLanguage()
        const chapters: any[] = []

        let page = 1
        let lastPage = 1
        do {
            const data = await this.fetchJson(`/api/comics/${encodeURIComponent(mangaId)}/chapter-list?lang=${encodeURIComponent(language)}&page=${page}`)
            chapters.push(...(data?.data ?? []))
            lastPage = Number(data?.pagination?.last_page ?? 1)
            page++
        } while (page <= lastPage && page <= MAX_CHAPTER_PAGES)

        return parseChapterList(chapters, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // chapterId is already the reader path segment: <hid>-chapter-<chap>-<lang>
        const response = await this.fetch(`/comic/${encodeURIComponent(mangaId)}/${chapterId}`)
        return parseChapterDetails(response.data as string, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections: Array<{ id: string, title: string, path: string, type: string, more: boolean }> = [
            {
                id: 'popular_ongoing',
                title: 'Popular Ongoing',
                path: `/api/search?type=comic&order_by=user_follow_count&order_direction=desc&status=1&showAll=false&exclude_mylist=false`,
                type: HomeSectionType.featured,
                more: false
            },
            { id: 'popular_7', title: 'Most Recent Popular (7 days)', path: '/api/comics/top?days=7&type=follow', type: HomeSectionType.singleRowNormal, more: false },
            { id: 'popular_30', title: 'Most Recent Popular (1 month)', path: '/api/comics/top?days=30&type=follow', type: HomeSectionType.singleRowNormal, more: false },
            { id: 'popular_90', title: 'Most Recent Popular (3 months)', path: '/api/comics/top?days=90&type=follow', type: HomeSectionType.singleRowNormal, more: false },
            { id: 'new_follow_7', title: 'Most Followed New Comics (7 days)', path: '/api/comics/top?days=7&type=most_follow_new', type: HomeSectionType.singleRowNormal, more: false },
            { id: 'new_follow_30', title: 'Most Followed New Comics (1 month)', path: '/api/comics/top?days=30&type=most_follow_new', type: HomeSectionType.singleRowNormal, more: false },
            { id: 'new_follow_90', title: 'Most Followed New Comics (3 months)', path: '/api/comics/top?days=90&type=most_follow_new', type: HomeSectionType.singleRowNormal, more: false },
            { id: 'updates', title: 'Updates', path: '/api/chapters/latest?order=new&page=1', type: HomeSectionType.singleRowNormal, more: true }
        ]

        for (const item of sections) {
            const section = App.createHomeSection({
                id: item.id,
                title: item.title,
                type: item.type,
                containsMoreItems: item.more
            })
            sectionCallback(section)

            try {
                const data = await this.fetchJson(item.path)
                section.items = parseMangaList(data?.data ?? [])
                sectionCallback(section)
            } catch (error) {
                console.log(`Error loading section ${item.id}:`, error)
            }
        }
    }

    override async getHomePageSection(sectionCallback: (section: HomeSection) => void): Promise<void> {
        return this.getHomePageSections(sectionCallback)
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        if (homepageSectionId !== 'updates') {
            // The top lists are fixed-size leaderboards, they have no further pages
            throw new Error(`View more not supported for section: ${homepageSectionId}`)
        }

        // `page=N` is what actually walks this feed — the cursor variant re-serves rows
        // it already returned, and dropping the param entirely yields a short list
        const page: number = metadata?.page ?? 1
        const data = await this.fetchJson(`/api/chapters/latest?order=new&page=${page}`)
        const results = parseMangaList(data?.data ?? [])

        return App.createPagedResults({
            results,
            metadata: results.length >= UPDATES_PAGE_SIZE ? { page: page + 1 } : undefined
        })
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const data = await this.fetchJson('/api/metadata')
        return parseSearchTags(data)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const cursor: string | undefined = metadata?.cursor

        // Manual query building — URLSearchParams does not exist in the Paperback iOS runtime
        const params: string[] = [
            'type=comic',
            'order_by=user_follow_count',
            'order_direction=desc',
            'showAll=false',
            'exclude_mylist=false'
        ]

        const title = query.title?.trim() ?? ''
        // The API rejects queries shorter than 3 characters; answer empty rather than
        // throwing an error at every keystroke while the user is still typing
        if (title && title.length < 3) {
            return App.createPagedResults({ results: [] })
        }
        if (title) {
            params.push(`q=${encodeURIComponent(title)}`)
        }

        for (const genre of getTagValues(query, 'genre')) {
            params.push(`genres=${encodeURIComponent(genre)}`)
        }
        for (const country of getTagValues(query, 'country')) {
            params.push(`country=${encodeURIComponent(country)}`)
        }
        const status = getTagValues(query, 'status')[0]
        if (status) params.push(`status=${encodeURIComponent(status)}`)

        if (cursor) params.push(`cursor=${encodeURIComponent(cursor)}`)

        const data = await this.fetchJson(`/api/search?${params.join('&')}`)
        const results = parseMangaList(data?.data ?? [])
        const nextCursor = data?.cursor ?? data?.next_cursor

        return App.createPagedResults({
            results,
            metadata: nextCursor && results.length >= SEARCH_PAGE_SIZE ? { cursor: nextCursor } : undefined
        })
    }

    override async getCloudflareBypassRequestAsync(): Promise<Request> {
        const baseUrl = await this.getBaseUrl()
        return App.createRequest({
            url: `${baseUrl}/home`,
            method: 'GET',
            headers: {
                'referer': `${baseUrl}/`,
                'origin': `${baseUrl}/`,
                'user-agent': await this.requestManager.getDefaultUserAgent()
            }
        })
    }

    override getCloudflareBypassRequest(): Request {
        return App.createRequest({
            url: `${DEFAULT_DOMAIN}/home`,
            method: 'GET',
            headers: {
                'referer': `${DEFAULT_DOMAIN}/`,
                'origin': `${DEFAULT_DOMAIN}/`
            }
        })
    }

    override getMangaShareUrl(mangaId: string): string {
        return `${DEFAULT_DOMAIN}/comic/${mangaId}`
    }
}
