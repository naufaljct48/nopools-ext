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
import { createRequestObject } from './KomiknesiaHelper'
import {
    parseMangaDetails,
    parseChapterList,
    parseChapterDetails,
    parseMangaList,
    parseSearchTags
} from './KomiknesiaParser'

const API_URL = 'https://api-be.komiknesia.my.id/api'
const BASE_URL = 'https://02.komiknesia.asia'

export const KomiknesiaInfo: SourceInfo = {
    version: '1.0.1',
    name: 'Komiknesia',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls manga from Komiknesia',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: BASE_URL,
    sourceTags: [
        {
            text: 'Indonesian',
            type: BadgeColor.GREY
        }
    ],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

export class Komiknesia extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const url = request.url || ''
                const isImage = /\.(png|jpe?g|webp|gif)$/i.test(url) ||
                    url.includes('cdn.itachi.my.id') ||
                    url.includes('cloudhost.id') ||
                    url.includes('ikiru.wtf')

                if (isImage) {
                    request.headers = {
                        ...(request.headers ?? {}),
                        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                        'Referer': `${BASE_URL}/`,
                    }
                } else {
                    request.headers = {
                        ...(request.headers ?? {}),
                        'Accept': '*/*',
                        'Origin': BASE_URL,
                        'Referer': `${BASE_URL}/`,
                        'Sec-GPC': '1',
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
            url: `${API_URL}/comic/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)

        if (!data.status) {
            throw new Error('Failed to get manga details')
        }

        return parseMangaDetails(data.data, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({
            url: `${API_URL}/comic/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)

        if (!data.status) return []

        return parseChapterList(data.data.chapters, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = createRequestObject({
            url: `${API_URL}/chapters/slug/${chapterId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)

        if (!data.status) {
            throw new Error('Failed to get chapter details')
        }

        return parseChapterDetails(data.data, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: createRequestObject({
                    url: `${API_URL}/contents?project=false&page=1&per_page=24`,
                    method: 'GET'
                }),
                section: App.createHomeSection({
                    id: 'latest',
                    title: 'Latest Updates',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                request: createRequestObject({
                    url: `${API_URL}/contents?project=false&page=1&per_page=24&orderBy=Popular`,
                    method: 'GET'
                }),
                section: App.createHomeSection({
                    id: 'popular',
                    title: 'Popular',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            }
        ]

        for (const item of sections) {
            sectionCallback(item.section)

            try {
                const response = await this.requestManager.schedule(item.request, 1)
                const data = JSON.parse(response.data as string)

                if (data.status && data.data) {
                    item.section.items = parseMangaList(data.data)
                    sectionCallback(item.section)
                }
            } catch (error) {
                console.log(`Error loading section ${item.section.id}:`, error)
            }
        }
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const request = createRequestObject({
            url: `${API_URL}/contents/genres`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)

        if (!data.status) return []

        return parseSearchTags(data.data)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const params: string[] = []

        params.push(`page=${page}`)
        params.push('per_page=24')

        if (query.title) {
            params.push(`q=${encodeURIComponent(query.title)}`)
        } else {
            params.push('project=false')
        }

        // Handle genre/type/status filters
        if (query.includedTags?.length) {
            for (const tag of query.includedTags) {
                // We encode the section info in the tag id format: "slug"
                // Need to check which section it belongs to
                const allTags = await this.getSearchTags()
                for (const section of allTags) {
                    const found = section.tags.find(t => t.id === tag.id)
                    if (found) {
                        if (section.id === 'genres') {
                            params.push(`genre=${encodeURIComponent(tag.id)}`)
                        } else if (section.id === 'type') {
                            params.push(`content_type=${encodeURIComponent(tag.id)}`)
                        } else if (section.id === 'status') {
                            params.push(`status=${encodeURIComponent(tag.id)}`)
                        }
                        break
                    }
                }
            }
        }

        const request = createRequestObject({
            url: `${API_URL}/contents?${params.join('&')}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)

        if (!data.status) {
            return App.createPagedResults({ results: [] })
        }

        const results = parseMangaList(data.data)
        const meta = data.meta
        const hasMore = meta ? meta.page < meta.total_pages : false

        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        let url = ''

        switch (homepageSectionId) {
            case 'latest':
                url = `${API_URL}/contents?project=false&page=${page}&per_page=24`
                break
            case 'popular':
                url = `${API_URL}/contents?project=false&page=${page}&per_page=24&orderBy=Popular`
                break
            default:
                throw new Error(`View more not supported for section: ${homepageSectionId}`)
        }

        const request = createRequestObject({
            url,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)

        if (!data.status) {
            return App.createPagedResults({ results: [] })
        }

        const results = parseMangaList(data.data)
        const meta = data.meta
        const hasMore = meta ? meta.page < meta.total_pages : false

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
        return `${BASE_URL}/comic/${mangaId}`
    }
}
