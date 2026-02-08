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

const WEBSITE_BASE = 'https://kiryuu03.com'

// Parse HTML using DOMParser (no cheerio)
const parseHTML = (html: string): Document => {
    const parser = new DOMParser()
    return parser.parseFromString(html, 'text/html')
}

export const KiryuuInfo: SourceInfo = {
    version: '2.1.6',
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
                request.headers = {
                    ...(request.headers ?? {} as Record<string, string>),
                    'Accept': isImage
                        ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                        : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Origin': WEBSITE_BASE,
                    'Referer': `${WEBSITE_BASE}/`,
                    'DNT': '1',
                    'Sec-GPC': '1',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
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
        const doc = parseHTML(response.data as string)
        return parseMangaDetails(doc, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const detailsRequest = createRequestObject({
            url: `${WEBSITE_BASE}/manga/${mangaId}/`
        })
        const detailsResponse = await this.requestManager.schedule(detailsRequest, 1)
        const html = detailsResponse.data as string
        
        const numericMangaId = extractMangaId(html)
        if (!numericMangaId) {
            throw new Error(`Failed to extract manga_id from ${mangaId}`)
        }

        const ajaxUrl = `${WEBSITE_BASE}/wp-admin/admin-ajax.php?manga_id=${numericMangaId}&page=1&action=chapter_list`
        const request = createRequestObject({
            url: ajaxUrl
        })
        const response = await this.requestManager.schedule(request, 1)
        const doc = parseHTML(response.data as string)
        
        return parseChapterList(doc, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = createRequestObject({
            url: `${WEBSITE_BASE}/manga/${mangaId}/${chapterId}/`
        })
        const response = await this.requestManager.schedule(request, 1)
        const doc = parseHTML(response.data as string)
        return parseChapterDetails(doc, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: createRequestObject({
                    url: WEBSITE_BASE
                }),
                section: App.createHomeSection({
                    id: 'popular_today',
                    title: 'Popular Today',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: false
                })
            },
            {
                request: createRequestObject({
                    url: `${WEBSITE_BASE}/wp-admin/admin-ajax.php?action=advanced_search`,
                    method: 'POST',
                    data: 'inclusion=OR&exclusion=OR&page=1&genre=[]&genre_exclude=[]&author=[]&artist=[]&project=0&type=[]&status=[]&order=desc&orderby=updated&query=',
                    headers: {
                        'content-type': 'application/x-www-form-urlencoded',
                        'origin': WEBSITE_BASE,
                        'referer': `${WEBSITE_BASE}/advanced-search/`,
                        'x-requested-with': 'XMLHttpRequest'
                    }
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
            const doc = parseHTML(response.data as string)
            item.section.items = parseMangaList(doc)
            sectionCallback(item.section)
        }
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const request = createRequestObject({
            url: `${WEBSITE_BASE}/advanced-search/`
        })
        const response = await this.requestManager.schedule(request, 1)
        const doc = parseHTML(response.data as string)
        return parseSearchTags(doc)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const searchTerm = query.title?.trim() ?? ''
        
        const includedTags = (query as any)?.includedTags as Array<{ id: string }>
        let genreList: string[] = []
        if (Array.isArray(includedTags) && includedTags.length > 0) {
            genreList = includedTags.map((tag: any) => tag.id)
        }

        let request
        if (searchTerm && genreList.length === 0) {
            request = createRequestObject({
                url: `${WEBSITE_BASE}/wp-admin/admin-ajax.php?action=search`,
                method: 'POST',
                data: `query=${encodeURIComponent(searchTerm)}`,
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'hx-request': 'true',
                    'origin': WEBSITE_BASE,
                    'referer': WEBSITE_BASE
                }
            })
        } else {
            const genreParam = genreList.length > 0 ? JSON.stringify(genreList) : '[]'
            const queryParam = searchTerm ? encodeURIComponent(searchTerm) : ''
            request = createRequestObject({
                url: `${WEBSITE_BASE}/wp-admin/admin-ajax.php?action=advanced_search`,
                method: 'POST',
                data: `inclusion=OR&exclusion=OR&page=${page}&genre=${genreParam}&genre_exclude=[]&author=[]&artist=[]&project=0&type=[]&status=[]&order=desc&orderby=updated&query=${queryParam}`,
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'origin': WEBSITE_BASE,
                    'referer': `${WEBSITE_BASE}/advanced-search/`,
                    'x-requested-with': 'XMLHttpRequest'
                }
            })
        }

        const response = await this.requestManager.schedule(request, 1)
        const doc = parseHTML(response.data as string)
        const results = parseMangaList(doc)
        const hasMore = results.length >= 20

        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        
        if (homepageSectionId !== 'latest_update') {
            throw new Error(`View more not supported for section: ${homepageSectionId}`)
        }

        const request = createRequestObject({
            url: `${WEBSITE_BASE}/wp-admin/admin-ajax.php?action=advanced_search`,
            method: 'POST',
            data: `inclusion=OR&exclusion=OR&page=${page}&genre=[]&genre_exclude=[]&author=[]&artist=[]&project=0&type=[]&status=[]&order=desc&orderby=updated&query=`,
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'origin': WEBSITE_BASE,
                'referer': `${WEBSITE_BASE}/advanced-search/`,
                'x-requested-with': 'XMLHttpRequest'
            }
        })
        
        const response = await this.requestManager.schedule(request, 1)
        const doc = parseHTML(response.data as string)
        const results = parseMangaList(doc)
        const hasMore = results.length >= 20

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
