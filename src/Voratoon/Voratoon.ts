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
    API_URL,
    BASE_URL,
    createRequestObject,
    isPresignExpired,
    PRESIGN_HOST,
    refreshCoverUrl
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
    version: '1.0.0',
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

                // Covers are presigned S3 links, so the extension check must ignore the query string
                const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(request.url.split('?')[0] ?? '')

                request.headers = isImage ? {
                    ...(request.headers ?? {}),
                    'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                    'Referer': `${BASE_URL}/`
                } : {
                    ...(request.headers ?? {}),
                    'Accept': 'application/json, text/plain, */*',
                    'Origin': BASE_URL,
                    'Referer': `${BASE_URL}/`,
                    'Sec-GPC': '1'
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    private async apiGet(url: string): Promise<any> {
        const response = await this.requestManager.schedule(createRequestObject({ url, method: 'GET' }), 1)

        if (response.status === 403 || response.status === 503) {
            throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${BASE_URL}> and press the cloud icon.`)
        }

        const data = JSON.parse(response.data as string)
        if (data?.status !== 200) {
            throw new Error(`Voratoon API error: ${data?.message ?? 'unknown response'}`)
        }
        return data
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const data = await this.apiGet(`${API_URL}/series/${mangaId}?includeMeta=true`)
        return parseMangaDetails(data.data, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const data = await this.apiGet(`${API_URL}/series/${mangaId}/chapters`)
        return parseChapterList(data.data, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // chapterId is the chapter index, which is what the endpoint takes
        const data = await this.apiGet(`${API_URL}/series/${mangaId}/chapters/${chapterId}`)
        return parseChapterDetails(data.data, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                url: `${API_URL}/series?preset=banner&includeMeta=true`,
                section: App.createHomeSection({
                    id: 'featured',
                    title: 'Featured',
                    type: HomeSectionType.featured,
                    containsMoreItems: false
                })
            },
            {
                url: `${API_URL}/series?takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=${PAGE_SIZE}&page=1`,
                section: App.createHomeSection({
                    id: 'latest_update',
                    title: 'Latest Update',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                url: `${API_URL}/series?takeChapter=1&includeMeta=true&sort=popular&sortOrder=desc&take=${PAGE_SIZE}&page=1`,
                section: App.createHomeSection({
                    id: 'popular',
                    title: 'Popular',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                url: `${API_URL}/series/recommendations?take=10&page=1&method=all`,
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
                const data = await this.apiGet(item.url)
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
        const data = await this.apiGet(`${API_URL}/genres`)
        return parseSearchTags(data.data)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1

        // Manual query building — URLSearchParams does not exist in the Paperback iOS runtime
        const params: string[] = [`page=${page}`, `take=${PAGE_SIZE}`, 'includeMeta=true']

        const title = query.title?.trim()
        const genres = getTagValues(query, 'genre:')
        // `filter` is RSQL and only one expression is honoured, so a text query wins
        // over genre ids. Plain `genres=`/`genreIds=` params are silently ignored.
        if (title) {
            const term = encodeURIComponent(title)
            params.push(`filter=title=like="${term}",nativeTitle=like="${term}"`)
        } else if (genres.length) {
            params.push(`filter=${encodeURIComponent(`genreIds=in=(${genres.join(',')})`)}`)
        }

        const status = getTagValues(query, 'status:')[0]
        if (status) params.push(`status=${encodeURIComponent(status)}`)
        const format = getTagValues(query, 'format:')[0]
        if (format) params.push(`format=${encodeURIComponent(format)}`)

        params.push('sort=latest')
        params.push('sortOrder=desc')

        const data = await this.apiGet(`${API_URL}/series?${params.join('&')}`)
        const results = parseMangaList(data.data)

        return App.createPagedResults({
            results,
            metadata: results.length >= PAGE_SIZE ? { page: page + 1 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1

        let url: string
        switch (homepageSectionId) {
            case 'latest_update':
                url = `${API_URL}/series?takeChapter=2&includeMeta=true&sort=latest&sortOrder=desc&take=${PAGE_SIZE}&page=${page}`
                break
            case 'popular':
                url = `${API_URL}/series?takeChapter=1&includeMeta=true&sort=popular&sortOrder=desc&take=${PAGE_SIZE}&page=${page}`
                break
            case 'recommendations':
                url = `${API_URL}/series/recommendations?take=${PAGE_SIZE}&page=${page}&method=all`
                break
            default:
                throw new Error(`View more not supported for section: ${homepageSectionId}`)
        }

        const data = await this.apiGet(url)
        const results = parseMangaList(data.data)

        return App.createPagedResults({
            results,
            metadata: results.length >= PAGE_SIZE ? { page: page + 1 } : undefined
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

    override getCloudflareBypassRequest(): Request {
        return App.createRequest({
            url: `${BASE_URL}/`,
            method: 'GET',
            headers: {
                'referer': `${BASE_URL}/`,
                'origin': `${BASE_URL}/`
            }
        })
    }

    override getMangaShareUrl(mangaId: string): string {
        return `${BASE_URL}/series/${mangaId}`
    }
}
