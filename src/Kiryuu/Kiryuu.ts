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
import { load as cheerioLoad } from 'cheerio'
import { createRequestObject, extractMangaId } from './KiryuuHelper'
import {
    parseMangaDetails,
    parseChapterList,
    parseChapterDetails,
    parseMangaList,
    parseSearchTags
} from './KiryuuParser'

const WEBSITE_BASE = 'https://kiryuu03.com'

export const KiryuuInfo: SourceInfo = {
    version: '1.0.2',
    name: 'Kiryuu',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls manga from Kiryuu (Custom Template)',
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

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = createRequestObject(`${WEBSITE_BASE}/manga/${mangaId}/`)
        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerioLoad(response.data as string)
        return parseMangaDetails($, mangaId)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        // First, get manga details page to extract manga ID
        const detailsRequest = createRequestObject(`${WEBSITE_BASE}/manga/${mangaId}/`)
        const detailsResponse = await this.requestManager.schedule(detailsRequest, 1)
        const html = detailsResponse.data as string
        
        const numericMangaId = extractMangaId(html)
        if (!numericMangaId) {
            throw new Error(`Failed to extract manga_id from ${mangaId}`)
        }

        // Then fetch chapter list via AJAX
        const ajaxUrl = `${WEBSITE_BASE}/wp-admin/admin-ajax.php?manga_id=${numericMangaId}&page=1&action=chapter_list`
        const request = createRequestObject(ajaxUrl)
        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerioLoad(response.data as string)
        
        return parseChapterList($, mangaId)
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = createRequestObject(`${WEBSITE_BASE}/manga/${mangaId}/${chapterId}/`)
        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerioLoad(response.data as string)
        return parseChapterDetails($, mangaId, chapterId)
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                id: 'popular_today',
                title: 'Popular Today',
                url: WEBSITE_BASE,
                type: 'get'
            },
            {
                id: 'latest_update',
                title: 'Latest Update',
                url: `${WEBSITE_BASE}/wp-admin/admin-ajax.php?action=advanced_search`,
                type: 'post'
            }
        ]

        for (const s of sections) {
            const section = App.createHomeSection({
                id: s.id,
                title: s.title,
                type: HomeSectionType.singleRowNormal,
                containsMoreItems: s.id === 'latest_update'
            })
            
            sectionCallback(section)
            
            let $: any
            if (s.type === 'post') {
                // Latest Update uses AJAX POST
                const body = 'nonce=2b6ee24052&inclusion=OR&exclusion=OR&page=1&genre=[]&genre_exclude=[]&author=[]&artist=[]&project=0&type=[]&status=[]&order=desc&orderby=updated&query='
                const request = createRequestObject(s.url, { 
                    method: 'POST', 
                    data: body,
                    headers: { 
                        'content-type': 'application/x-www-form-urlencoded',
                        'origin': WEBSITE_BASE,
                        'referer': `${WEBSITE_BASE}/advanced-search/`
                    } 
                })
                const response = await this.requestManager.schedule(request, 1)
                $ = cheerioLoad(response.data as string)
            } else {
                const request = createRequestObject(s.url)
                const response = await this.requestManager.schedule(request, 1)
                $ = cheerioLoad(response.data as string)
            }
            
            section.items = parseMangaList($)
            sectionCallback(section)
        }
    }

    async getSearchTags(): Promise<TagSection[]> {
        const request = createRequestObject(`${WEBSITE_BASE}/advanced-search/`)
        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerioLoad(response.data as string)
        return parseSearchTags($)
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const searchTerm = query.title?.trim() ?? ''
        
        // Handle genre filter
        const includedTags = (query as any)?.includedTags as Array<{ id: string }>
        let genreList: string[] = []
        if (Array.isArray(includedTags) && includedTags.length > 0) {
            genreList = includedTags.map((tag: any) => tag.id)
        }

        // If there's a search term, use the AJAX search endpoint (returns #searchResults HTML)
        let $: any
        if (searchTerm && genreList.length === 0) {
            // Simple text search
            const ajaxUrl = `${WEBSITE_BASE}/wp-admin/admin-ajax.php?action=search`
            const body = `query=${encodeURIComponent(searchTerm)}`
            const request = createRequestObject(ajaxUrl, { 
                method: 'POST', 
                data: body, 
                headers: { 
                    'content-type': 'application/x-www-form-urlencoded', 
                    'hx-request': 'true',
                    'origin': WEBSITE_BASE,
                    'referer': WEBSITE_BASE
                } 
            })
            const response = await this.requestManager.schedule(request, 1)
            $ = cheerioLoad(response.data as string)
        } else {
            // Advanced search (with genres or filters) - use POST to advanced_search AJAX
            const ajaxUrl = `${WEBSITE_BASE}/wp-admin/admin-ajax.php?action=advanced_search`
            const genreParam = genreList.length > 0 ? JSON.stringify(genreList) : '[]'
            const queryParam = searchTerm ? encodeURIComponent(searchTerm) : ''
            const body = `nonce=2b6ee24052&inclusion=OR&exclusion=OR&page=${page}&genre=${genreParam}&genre_exclude=[]&author=[]&artist=[]&project=0&type=[]&status=[]&order=desc&orderby=updated&query=${queryParam}`
            
            const request = createRequestObject(ajaxUrl, { 
                method: 'POST', 
                data: body,
                headers: { 
                    'content-type': 'application/x-www-form-urlencoded',
                    'origin': WEBSITE_BASE,
                    'referer': `${WEBSITE_BASE}/advanced-search/`
                } 
            })
            const response = await this.requestManager.schedule(request, 1)
            $ = cheerioLoad(response.data as string)
        }

        const results = parseMangaList($)
        
        // Check if there are more results
        const hasMore = results.length >= 20 // Assuming 20 per page
        
        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        
        if (homepageSectionId !== 'latest_update') {
            throw new Error(`View more not supported for section: ${homepageSectionId}`)
        }

        // Latest Update uses AJAX POST
        const url = `${WEBSITE_BASE}/wp-admin/admin-ajax.php?action=advanced_search`
        const body = `nonce=2b6ee24052&inclusion=OR&exclusion=OR&page=${page}&genre=[]&genre_exclude=[]&author=[]&artist=[]&project=0&type=[]&status=[]&order=desc&orderby=updated&query=`
        const request = createRequestObject(url, { 
            method: 'POST', 
            data: body,
            headers: { 
                'content-type': 'application/x-www-form-urlencoded',
                'origin': WEBSITE_BASE,
                'referer': `${WEBSITE_BASE}/advanced-search/`
            } 
        })
        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerioLoad(response.data as string)
        
        const results = parseMangaList($)
        const hasMore = results.length >= 20
        
        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }
}

