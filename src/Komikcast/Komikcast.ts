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
import { createRequestObject } from './KomikcastHelper'
import {
    parseMangaDetails,
    parseChapterList,
    parseChapterDetails,
    parseMangaList,
    parseSearchTags
} from './KomikcastParser'

const API_URL = 'https://be.komikcast.cc'
const BASE_URL = 'https://v2.komikcast.fit'

// Token from your curl request - might need to be dynamic/rotated
const AUTH_TOKEN = 'oat_NTQwNjU.eVU0Tjc4aEhpNmlwcDJkNWlDSU9GT0w2VXJxR25UdFc5UnV0dHRGdzY1MDY1NjYyNw'

export const KomikcastInfo: SourceInfo = {
    version: '4.0.8',
    name: 'Komikcast',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls manga from Komikcast (API-based)',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: BASE_URL,
    sourceTags: [{ text: 'Indonesian', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

export class Komikcast extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /\.(png|jpe?g|webp|gif)$/i.test(request.url)
                
                if (isImage) {
                    request.headers = {
                        ...(request.headers ?? {}),
                        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                        'Referer': `${BASE_URL}/`,
                    }
                } else {
                    // API requests
                    request.headers = {
                        ...(request.headers ?? {}),
                        'Accept': 'application/json, text/plain, */*',
                        'Authorization': `Bearer ${AUTH_TOKEN}`,
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
            url: `${API_URL}/series/${mangaId}?includeMeta=true`,
            method: 'GET'
        })
        
        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)
        
        if (data.status !== 200) {
            throw new Error(`Failed to get manga details: ${data.message}`)
        }
        
        return parseMangaDetails(data.data, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        // Get chapters from separate endpoint
        const request = createRequestObject({
            url: `${API_URL}/series/${mangaId}/chapters`,
            method: 'GET'
        })
        
        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)
        
        if (data.status !== 200) {
            return []
        }
        
        return parseChapterList(data.data, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // chapterId is the chapter index (e.g., "148")
        const request = createRequestObject({
            url: `${API_URL}/series/${mangaId}/chapters/${chapterId}`,
            method: 'GET'
        })
        
        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)
        
        if (data.status !== 200) {
            throw new Error(`Failed to get chapter details: ${data.message}`)
        }
        
        return parseChapterDetails(data.data, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: createRequestObject({
                    url: `${API_URL}/series?preset=banner&includeMeta=true`,
                    method: 'GET'
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
                    url: `${API_URL}/series?takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=12&page=1`,
                    method: 'GET'
                }),
                section: App.createHomeSection({
                    id: 'latest_update',
                    title: 'Latest Update',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                request: createRequestObject({
                    url: `${API_URL}/series/recommendations?take=10&page=1&method=all`,
                    method: 'GET'
                }),
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
                const response = await this.requestManager.schedule(item.request, 1)
                const data = JSON.parse(response.data as string)
                
                if (data.status === 200 && data.data) {
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
            url: `${API_URL}/genres`,
            method: 'GET'
        })
        
        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)
        
        if (data.status !== 200) {
            return []
        }
        
        return parseSearchTags(data.data)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const params: string[] = []

        params.push(`page=${page}`)
        params.push('take=24')

        // Handle text search with filter parameter
        // Format: filter=title=like="solo",nativeTitle=like="solo"
        if (query.title) {
            const searchTerm = encodeURIComponent(query.title)
            const filterParam = `title=like="${searchTerm}",nativeTitle=like="${searchTerm}"`
            params.push(`filter=${filterParam}`)
        }

        // Handle filters from tags
        // We need to determine which section each tag belongs to
        if (query.includedTags?.length) {
            // Get all available tags to determine sections
            const tagsResponse = await this.getSearchTags()

            for (const tag of query.includedTags) {
                // Find which section this tag belongs to
                for (const section of tagsResponse) {
                    const foundTag = section.tags.find(t => t.id === tag.id)
                    if (foundTag) {
                        if (section.id === 'genres') {
                            params.push(`genreIds=${encodeURIComponent(tag.id)}`)
                        } else if (section.id === 'status') {
                            params.push(`status=${encodeURIComponent(tag.id)}`)
                        } else if (section.id === 'format') {
                            params.push(`format=${encodeURIComponent(tag.id)}`)
                        }
                        break
                    }
                }
            }
        }

        // Add parameters for better results
        params.push('includeMeta=true')
        params.push('sort=latest')
        params.push('sortOrder=desc')

        const queryString = params.join('&')

        const request = createRequestObject({
            url: `${API_URL}/series?${queryString}`,
            method: 'GET'
        })
        
        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data as string)
        
        if (data.status !== 200) {
            return App.createPagedResults({
                results: []
            })
        }
        
        const results = parseMangaList(data.data)
        const hasMore = data.data.length >= 24
        
        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        let url = ''
        
        switch (homepageSectionId) {
            case 'latest_update':
                url = `${API_URL}/series?takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=24&page=${page}`
                break
            case 'recommendations':
                url = `${API_URL}/series/recommendations?take=24&page=${page}&method=all`
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
        
        if (data.status !== 200) {
            return App.createPagedResults({
                results: []
            })
        }
        
        const results = parseMangaList(data.data)
        const hasMore = data.data.length >= 24
        
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
        return `${BASE_URL}/series/${mangaId}`
    }
}
