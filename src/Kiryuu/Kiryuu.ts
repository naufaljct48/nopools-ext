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
    version: '1.0.0',
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
                url: WEBSITE_BASE
            },
            {
                id: 'latest_update',
                title: 'Latest Update',
                url: `${WEBSITE_BASE}/advanced-search/?the_page=1&orderby=updated&order=desc`
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
            
            const request = createRequestObject(s.url)
            const response = await this.requestManager.schedule(request, 1)
            const $ = cheerioLoad(response.data as string)
            
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
        
        // Build URL params
        const params: string[] = [
            `the_page=${page}`,
            'order=desc',
            'orderby=updated'
        ]

        if (searchTerm) {
            params.push(`search_term=${encodeURIComponent(searchTerm)}`)
        }

        // Handle genre filter
        const includedTags = (query as any)?.includedTags as Array<{ id: string }>
        if (Array.isArray(includedTags) && includedTags.length > 0) {
            // Find genre tags (section id: 'genre')
            const genreTags = includedTags.filter((tag: any) => {
                // Assuming genre tags don't have specific section marker, use all for now
                return true
            })
            
            if (genreTags.length > 0) {
                // Kiryuu uses the_genre parameter with comma-separated values
                const genres = genreTags.map((tag: any) => tag.id).join(',')
                params.push(`the_genre=${encodeURIComponent(genres)}`)
            }
        }

        const url = `${WEBSITE_BASE}/advanced-search/?${params.join('&')}`
        const request = createRequestObject(url)
        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerioLoad(response.data as string)
        
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

        const url = `${WEBSITE_BASE}/advanced-search/?the_page=${page}&orderby=updated&order=desc`
        const request = createRequestObject(url)
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

