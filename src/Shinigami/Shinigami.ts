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
import { createRequestObject } from './ShinigamiHelper'
import { parseMangaDetails, parseChapterList, parseChapterDetails, parseMangaList } from './ShinigamiParser'

const API_URL = 'https://api.shngm.io'
const BASE_URL = 'https://app.shinigami.asia'

export const ShinigamiInfo: SourceInfo = {
    version: '1.2.6',
    name: 'Shinigami',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls manga from Shinigami',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: BASE_URL,
    sourceTags: [
        {
            text: 'Indonesian',
            type: BadgeColor.GREY
        }
    ],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

export class Shinigami extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                // Add headers for image requests
                if (request.url.includes('assets.shngm.id')) {
                    request.headers = {
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                        'DNT': '1',
                        'Referer': BASE_URL + '/',
                        'Sec-Fetch-Dest': 'empty',
                        'Sec-GPC': '1'
                    }
                } else {
                    // For API requests
                    request.headers = {
                        'Accept': 'application/json',
                        'Origin': BASE_URL,
                        'DNT': '1',
                        'Sec-GPC': '1'
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
            url: `${API_URL}/v1/manga/detail/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)

        if (data.retcode !== 0) {
            throw new Error('Failed to get manga details')
        }

        return parseMangaDetails(data, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({
            url: `${API_URL}/v1/chapter/${mangaId}/list`,
            param: '?page=1&page_size=3000&sort_by=chapter_number&sort_order=desc',
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)

        if (data.retcode !== 0) return []

        return parseChapterList(data, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = createRequestObject({
            url: `${API_URL}/v1/chapter/detail/${chapterId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)

        if (data.retcode !== 0) {
            throw new Error('Failed to get chapter details')
        }

        return parseChapterDetails(data, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: createRequestObject({
                    url: `${API_URL}/v1/manga/list?type=project&page=1&page_size=24&is_update=true&sort=latest&sort_order=desc`,
                    method: 'GET'
                }),
                section: App.createHomeSection({
                    id: 'latest',
                    title: 'Project Updates',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                request: createRequestObject({
                    url: `${API_URL}/v1/manga/list?format=manhwa&page=1&page_size=10&is_recommended=true`,
                    method: 'GET'
                }),                
                section: App.createHomeSection({
                    id: 'featured',
                    title: 'Featured Series',
                    type: HomeSectionType.featured,
                    containsMoreItems: true
                })
            },
            {
                request: createRequestObject({
                    url: `${API_URL}/v1/manga/list?type=mirror&page=1&page_size=15&is_update=true&sort=latest&sort_order=desc`,
                    method: 'GET'
                }),
                section: App.createHomeSection({
                    id: 'mirror',
                    title: 'Mirror Project',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                request: createRequestObject({
                    url: `${API_URL}/v1/manga/list?page=1&page_size=24&genre_include_mode=or&genre_exclude_mode=or&format=manga&sort=popularity&sort_order=desc`,
                    method: 'GET'
                }),
                section: App.createHomeSection({
                    id: 'manga',
                    title: 'Popular Manga',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                request: createRequestObject({
                    url: `${API_URL}/v1/manga/list?page=1&page_size=24&genre_include_mode=or&genre_exclude_mode=or&format=manhua&sort=popularity&sort_order=desc`,
                    method: 'GET'
                }),
                section: App.createHomeSection({
                    id: 'manhua',
                    title: 'Popular Manhua',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            }
        ]

        for (const section of sections) {
            sectionCallback(section.section)
            const response = await this.requestManager.schedule(section.request, 1)
            const data = JSON.parse(response.data as string)

            if (data.retcode !== 0) continue

            section.section.items = parseMangaList(data)
            sectionCallback(section.section)
        }
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const requests = [
            {
                request: createRequestObject({
                    url: `${API_URL}/v1/genre/list`,
                    method: 'GET'
                }),
                section: 'genres'
            },
            {
                request: createRequestObject({
                    url: `${API_URL}/v1/format/list`,
                    method: 'GET'
                }),
                section: 'types'
            }
        ]
    
        const tags: TagSection[] = []
    
        for (const req of requests) {
            const response = await this.requestManager.schedule(req.request, 1)
            const data = JSON.parse(response.data as string)
    
            if (data.retcode !== 0) continue
    
            tags.push(App.createTagSection({
                id: req.section,
                label: req.section.charAt(0).toUpperCase() + req.section.slice(1),
                tags: data.data.map((item: any) => App.createTag({
                    id: item.slug,
                    label: item.name
                }))
            }))
        }
    
        return tags
    }

    override async getSearchResults(query: SearchRequest): Promise<PagedResults> {
        const params = [
            'page=1',
            'page_size=24',
            'genre_include_mode=or',
            'genre_exclude_mode=or',
            'sort=popularity',
            'sort_order=desc'
        ]
    
        if (query.title) {
            params.push(`q=${encodeURIComponent(query.title)}`)
        }
    
        if (query.includedTags?.length) {
            const genres = query.includedTags.filter(tag => tag.id === 'genres').map(tag => tag.id)
            const formats = query.includedTags.filter(tag => tag.id === 'types').map(tag => tag.id)
            
            if (genres.length) {
                params.push(`genre_include=${genres.join(',')}`)
            }
            if (formats.length) {
                params.push(`format=${formats.join(',')}`)
            }
        }
    
        const request = createRequestObject({
            url: `${API_URL}/v1/manga/list`,
            param: `?${params.join('&')}`,
            method: 'GET'
        })
    
        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)
    
        if (data.retcode !== 0) {
            return App.createPagedResults({
                results: []
            })
        }
    
        return App.createPagedResults({
            results: parseMangaList(data)
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        let param = ''

        switch (homepageSectionId) {
            case 'latest':
                param = `?type=project&page=${page}&page_size=24&is_update=true&sort=latest&sort_order=desc`
                break
            case 'featured':
                param = `?format=manhwa&page=${page}&page_size=30&is_recommended=true`
                break
            case 'mirror':
                param = `?type=mirror&page=${page}&page_size=30&is_update=true&sort=latest&sort_order=desc`
                break
            case 'manga':
                param = `?page=${page}&page_size=24&genre_include_mode=or&genre_exclude_mode=or&format=manga&sort=popularity&sort_order=desc`
                break
            case 'manhua':
                param = `?page=${page}&page_size=24&genre_include_mode=or&genre_exclude_mode=or&format=manhua&sort=popularity&sort_order=desc`
                break
            default:
                throw new Error(`Invalid homepage section id: ${homepageSectionId}`)
        }

        const request = createRequestObject({
            url: `${API_URL}/v1/manga/list${param}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)

        if (data.retcode !== 0) {
            return App.createPagedResults({
                results: []
            })
        }

        // Check if there are more pages
        const pageSize = homepageSectionId === 'latest' ? 24 : 30
        const hasNextPage = data.data.length === pageSize

        return App.createPagedResults({
            results: parseMangaList(data),
            metadata: hasNextPage ? { page: page + 1 } : undefined
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
        return `${BASE_URL}/series/${mangaId}`
    }
}
