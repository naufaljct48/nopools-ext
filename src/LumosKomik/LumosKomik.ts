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
import { createRequestObject, WEBSITE_BASE } from './LumosKomikHelper'
import {
    parseChapterDetails,
    parseChapterList,
    parseMangaDetails,
    parseMangaList,
    parseSearchTags,
    parseTotalResults,
    parseTotalSeriesFound,
    sliceSection
} from './LumosKomikParser'

const PAGE_SIZE = 24
const PROJECT_PAGE_SIZE = 25

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

const buildBrowseUrl = (params: Record<string, string | undefined>): string => {
    const query = Object.entries(params)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
        .join('&')

    return `${WEBSITE_BASE}/browse${query ? `?${query}` : ''}`
}

export const LumosKomikInfo: SourceInfo = {
    version: '1.0.2',
    name: 'LumosKomik',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls manga from LumosKomik',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: WEBSITE_BASE,
    sourceTags: [{ text: 'Indonesian', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI
}

export class LumosKomik extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {} as Record<string, string>),
                    'Referer': `${WEBSITE_BASE}/`
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = createRequestObject({ url: `${WEBSITE_BASE}/comic/${mangaId}` })
        const response = await this.requestManager.schedule(request, 1)
        return parseMangaDetails(response.data as string, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({ url: `${WEBSITE_BASE}/comic/${mangaId}` })
        const response = await this.requestManager.schedule(request, 1)

        const chapters = parseChapterList(response.data as string, mangaId)
        if (chapters.length === 0) throw new Error(`Failed to find any chapters for manga ${mangaId}`)

        return chapters
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = createRequestObject({ url: `${WEBSITE_BASE}/read/${mangaId}/${chapterId}` })
        const response = await this.requestManager.schedule(request, 1)
        return parseChapterDetails(response.data as string, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections: Array<{ url: string, containerId?: string, section: HomeSection }> = [
            {
                url: buildBrowseUrl({ sort: 'popular' }),
                section: App.createHomeSection({
                    id: 'popular',
                    title: 'Popular',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                url: `${WEBSITE_BASE}/`,
                containerId: 'project-list-view',
                section: App.createHomeSection({
                    id: 'project',
                    title: 'Project',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                url: buildBrowseUrl({ sort: 'latest' }),
                section: App.createHomeSection({
                    id: 'latest_update',
                    title: 'Latest Update',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                url: buildBrowseUrl({ sort: 'rating' }),
                section: App.createHomeSection({
                    id: 'top_rating',
                    title: 'Top Rating',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            }
        ]

        for (const item of sections) {
            sectionCallback(item.section)

            const response = await this.requestManager.schedule(createRequestObject({ url: item.url }), 1)
            const html = response.data as string

            item.section.items = parseMangaList(item.containerId ? sliceSection(html, item.containerId) : html)
            sectionCallback(item.section)
        }
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1

        // Project list lives on its own paginated page, separate from /browse
        if (homepageSectionId === 'project') {
            const request = createRequestObject({ url: `${WEBSITE_BASE}/project?page=${page}` })
            const response = await this.requestManager.schedule(request, 1)
            const html = response.data as string

            const results = parseMangaList(html)
            const total = parseTotalSeriesFound(html)
            const hasMore = total > 0 ? page * PROJECT_PAGE_SIZE < total : results.length >= PROJECT_PAGE_SIZE

            return App.createPagedResults({
                results,
                metadata: hasMore ? { page: page + 1 } : undefined
            })
        }

        const sorts: Record<string, string> = {
            popular: 'popular',
            latest_update: 'latest',
            top_rating: 'rating'
        }

        const sort = sorts[homepageSectionId]
        if (!sort) throw new Error(`View more not supported for section: ${homepageSectionId}`)

        return this.browse({ sort, page: String(page) }, page)
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const request = createRequestObject({ url: `${WEBSITE_BASE}/browse` })
        const response = await this.requestManager.schedule(request, 1)
        return parseSearchTags(response.data as string)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        const genres = getIncludedTagsByPrefix(query, 'genre:')
        const statuses = getIncludedTagsByPrefix(query, 'status:')
        const types = getIncludedTagsByPrefix(query, 'type:')

        return this.browse({
            q: query.title?.trim() ?? '',
            page: String(page),
            genre: genres.join(','),
            status: statuses[0] ?? '',
            type: types[0] ?? ''
        }, page)
    }

    private async browse(params: Record<string, string | undefined>, page: number): Promise<PagedResults> {
        const request = createRequestObject({ url: buildBrowseUrl(params) })
        const response = await this.requestManager.schedule(request, 1)
        const html = response.data as string

        const results = parseMangaList(html)
        const total = parseTotalResults(html)
        const hasMore = total > 0 ? page * PAGE_SIZE < total : results.length >= PAGE_SIZE

        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }

    override async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: `${WEBSITE_BASE}/`,
            method: 'GET',
            headers: {
                'referer': `${WEBSITE_BASE}/`,
                'origin': `${WEBSITE_BASE}/`,
                'user-agent': await this.requestManager.getDefaultUserAgent()
            }
        })
    }

    override getMangaShareUrl(mangaId: string): string {
        return `${WEBSITE_BASE}/comic/${mangaId}`
    }
}
