import {
    Source,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    HomeSectionType,
    SourceInfo,
    ContentRating,
    BadgeColor,
    SourceIntents,
    TagSection,
    Request,
    Response,
    SourceManga
} from '@paperback/types'
import { createRequestObject, extractMangaId } from './KiryuuHelper'
import {
    parseMangaDetails,
    parseChapterList,
    parseChapterDetails,
    parseMangaList,
    parseSearchTags
} from './KiryuuParser'

const WEBSITE_BASE = 'https://v5.kiryuu.to'

const getSearchNonce = async (requestManager: any): Promise<string> => {
    const request = createRequestObject({
        url: `${WEBSITE_BASE}/wp-admin/admin-ajax.php?type=search_form&action=get_nonce`,
        headers: {
            'hx-request': 'true',
            'referer': `${WEBSITE_BASE}/advanced-search/`
        }
    })
    const response = await requestManager.schedule(request, 1)
    const nonce = String(response.data ?? '').match(/name=['"]search_nonce['"]\s+value=['"]([^'"]+)['"]/)?.[1] ?? ''
    if (!nonce) throw new Error('Failed to get Kiryuu search nonce')
    return nonce
}

const createAdvancedSearchBody = (nonce: string, page: number, query: string, genres: string[], types: string[], statuses: string[], orderBy: string): string => {
    return [
        `search_nonce=${encodeURIComponent(nonce)}`,
        'inclusion=OR',
        'exclusion=OR',
        `page=${page}`,
        `genre=${encodeURIComponent(JSON.stringify(genres))}`,
        `genre_exclude=${encodeURIComponent(JSON.stringify([]))}`,
        `author=${encodeURIComponent(JSON.stringify([]))}`,
        `artist=${encodeURIComponent(JSON.stringify([]))}`,
        'project=0',
        `type=${encodeURIComponent(JSON.stringify(types))}`,
        `status=${encodeURIComponent(JSON.stringify(statuses))}`,
        'order=desc',
        `orderby=${encodeURIComponent(orderBy)}`,
        `query=${encodeURIComponent(query)}`
    ].join('&')
}

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

export const KiryuuInfo: SourceInfo = {
    version: '2.2.6',
    name: 'Kiryuu',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls manga from Kiryuu',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: WEBSITE_BASE,
    sourceTags: [{ text: 'Indonesian', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

export class Kiryuu extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /\.(png|jpe?g|webp|gif)$/i.test(request.url)
                if (isImage) {
                    request.headers = {
                        ...(request.headers ?? {} as Record<string, string>),
                        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                        'Referer': `${WEBSITE_BASE}/`
                    }
                } else {
                    request.headers = {
                        ...(request.headers ?? {} as Record<string, string>),
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Origin': WEBSITE_BASE,
                        'Referer': `${WEBSITE_BASE}/`,
                        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
                    }
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = createRequestObject({
            url: `${WEBSITE_BASE}/manga/${mangaId}/`
        })
        const response = await this.requestManager.schedule(request, 1)
        return parseMangaDetails(response.data as string, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const detailsRequest = createRequestObject({
            url: `${WEBSITE_BASE}/manga/${mangaId}/`
        })
        const detailsResponse = await this.requestManager.schedule(detailsRequest, 1)
        const numericMangaId = extractMangaId(detailsResponse.data as string)
        if (!numericMangaId) throw new Error(`Failed to extract manga_id from ${mangaId}`)

        const request = createRequestObject({
            url: `${WEBSITE_BASE}/wp-admin/admin-ajax.php?manga_id=${numericMangaId}&page=1&action=chapter_list`,
            headers: {
                'hx-request': 'true',
                'referer': `${WEBSITE_BASE}/manga/${mangaId}/`
            }
        })
        const response = await this.requestManager.schedule(request, 1)
        return parseChapterList(response.data as string, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = createRequestObject({
            url: `${WEBSITE_BASE}/manga/${mangaId}/${chapterId}/`
        })
        const response = await this.requestManager.schedule(request, 1)
        return parseChapterDetails(response.data as string, mangaId, chapterId)
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections: Array<{ request: Request, section: HomeSection }> = [
            {
                request: createRequestObject({
                    url: `${WEBSITE_BASE}/latest/`
                }),
                section: App.createHomeSection({
                    id: 'featured',
                    title: 'Featured',
                    type: HomeSectionType.featured,
                    containsMoreItems: false
                })
            },
            {
                request: createRequestObject({
                    url: `${WEBSITE_BASE}/project/`
                }),
                section: App.createHomeSection({
                    id: 'project_updates',
                    title: 'Project Updates',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                request: createRequestObject({
                    url: `${WEBSITE_BASE}/latest/`
                }),
                section: App.createHomeSection({
                    id: 'latest_update',
                    title: 'Latest Update',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            }
        ]

        for (const item of sections) {
            sectionCallback(item.section)
            const response = await this.requestManager.schedule(item.request, 1)
            const parsedItems = parseMangaList(response.data as string)
            item.section.items = item.section.id === 'featured' ? parsedItems.slice(0, 12) : parsedItems
            sectionCallback(item.section)
        }
    }

    async getSearchTags(): Promise<TagSection[]> {
        const request = createRequestObject({
            url: `${WEBSITE_BASE}/advanced-search/`
        })
        const response = await this.requestManager.schedule(request, 1)
        return parseSearchTags(response.data as string)
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const searchTerm = query.title?.trim() ?? ''
        const genreList = getIncludedTagsByPrefix(query, 'genre:')
        const typeList = getIncludedTagsByPrefix(query, 'type:')
        const statusList = getIncludedTagsByPrefix(query, 'status:')

        const nonce = await getSearchNonce(this.requestManager)
        const request = createRequestObject({
            url: `${WEBSITE_BASE}/wp-admin/admin-ajax.php?action=advanced_search`,
            method: 'POST',
            data: createAdvancedSearchBody(nonce, page, searchTerm, genreList, typeList, statusList, 'updated'),
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'origin': WEBSITE_BASE,
                'referer': `${WEBSITE_BASE}/advanced-search/`,
                'x-requested-with': 'XMLHttpRequest'
            }
        })

        const response = await this.requestManager.schedule(request, 1)
        const results = parseMangaList(response.data as string)
        const hasMore = results.length >= 20

        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        
        let url: string
        if (homepageSectionId === 'latest_update') {
            url = `${WEBSITE_BASE}/latest/?the_page=${page}`
        } else if (homepageSectionId === 'project_updates') {
            url = `${WEBSITE_BASE}/project/?the_page=${page}`
        } else {
            throw new Error(`View more not supported for section: ${homepageSectionId}`)
        }

        const request = createRequestObject({ url })
        const response = await this.requestManager.schedule(request, 1)
        const results = parseMangaList(response.data as string)
        const hasMore = results.length >= 12

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
        return `${WEBSITE_BASE}/manga/${mangaId}`
    }
}
