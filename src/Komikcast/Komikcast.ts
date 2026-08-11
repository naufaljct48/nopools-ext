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
const BASE_URL = 'https://v3.komikcast.fit'

// Token from your curl request - might need to be dynamic/rotated
const AUTH_TOKEN = 'oat_NTQwNjU.eVU0Tjc4aEhpNmlwcDJkNWlDSU9GT0w2VXJxR25UdFc5UnV0dHRGdzY1MDY1NjYyNw'

const PRESIGN_HOST = 'minio.imgkc1.my.id'

// Covers are presigned S3 links that die after X-Amz-Expires seconds (24h today), so any
// URL the app kept from an earlier session points at a dead signature.
export const isPresignExpired = (url: string): boolean => {
    const signedAt = url.match(/X-Amz-Date=(\d{8}T\d{6}Z)/)?.[1]
    const lifetime = Number(url.match(/X-Amz-Expires=(\d+)/)?.[1] ?? 0)
    if (!signedAt || !lifetime) return false

    const iso = `${signedAt.slice(0, 4)}-${signedAt.slice(4, 6)}-${signedAt.slice(6, 8)}T${signedAt.slice(9, 11)}:${signedAt.slice(11, 13)}:${signedAt.slice(13, 15)}Z`
    const expiresAt = Date.parse(iso) + lifetime * 1000
    if (isNaN(expiresAt)) return false

    return Date.now() >= expiresAt - 60 * 1000
}

// /prod/series/<slug>/cover/... — ask the API for the same series to get a fresh signature
const refreshCoverUrl = async (requestManager: any, url: string): Promise<string> => {
    const slug = url.match(/\/series\/([^/]+)\//)?.[1]
    if (!slug) return url

    const response = await requestManager.schedule(createRequestObject({
        url: `${API_URL}/series/${slug}?includeMeta=true`,
        method: 'GET'
    }), 1)
    const data = JSON.parse(response.data as string)

    return data?.data?.data?.coverImage || url
}

export const KomikcastInfo: SourceInfo = {
    version: '4.0.9',
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
                if (request.url.includes(PRESIGN_HOST) && isPresignExpired(request.url)) {
                    try {
                        request.url = await refreshCoverUrl(this.requestManager, request.url)
                    } catch (error) {
                        console.log('Failed to refresh expired cover URL:', error)
                    }
                }

                // Cover URLs are presigned S3 links, so the extension check must ignore the query string
                const isImage = /\.(png|jpe?g|webp|gif)$/i.test(request.url.split('?')[0] ?? '')
                
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
