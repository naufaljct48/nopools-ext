import { Source, Chapter, ChapterDetails, HomeSection, SearchRequest, PagedResults, HomeSectionType, SourceInfo, ContentRating, BadgeColor, SourceIntents, TagSection, Request, Response, SourceManga } from '@paperback/types'
import { createRequestObject } from './WestMangaHelper'
import { parseMangaDetails, parseChapterList, parseChapterDetails, parseMangaList } from './WestMangaParser'

const BASE_URL = 'https://westmanga.me'

export const WestMangaInfo: SourceInfo = {
    version: '1.0.0',
    name: 'WestManga',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension yang mengambil manga dari WestManga',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: BASE_URL,
    sourceTags: [{ text: 'Indonesian', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

export class WestManga extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /(\.(png|jpe?g|webp|gif)$)|storage\./i.test(request.url)
                request.headers = {
                    ...(request.headers ?? {} as Record<string, string>),
                    'Accept': isImage
                        ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                        : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Origin': BASE_URL,
                    'Referer': `${BASE_URL}/`,
                    'DNT': '1',
                    'Sec-GPC': '1',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = createRequestObject({ url: `${BASE_URL}/comic/${mangaId}`, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const $ = require('cheerio').load(response.data as string)
        return parseMangaDetails($, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({ url: `${BASE_URL}/comic/${mangaId}`, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const $ = require('cheerio').load(response.data as string)
        return parseChapterList($, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const isAbs = chapterId.startsWith('http://') || chapterId.startsWith('https://')
        const url = isAbs ? chapterId : `${BASE_URL}${chapterId.startsWith('/') ? '' : '/'}${chapterId}`
        const request = createRequestObject({ url, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const $ = require('cheerio').load(response.data as string)
        return parseChapterDetails($, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections: { request: any, section: HomeSection, scope: string }[] = [
            {
                request: createRequestObject({ url: `${BASE_URL}/`, method: 'GET' }),
                section: App.createHomeSection({ id: 'popular_today', title: 'Popular Today', type: HomeSectionType.singleRowNormal, containsMoreItems: false }),
                scope: 'popular_today'
            },
            {
                request: createRequestObject({ url: `${BASE_URL}/`, method: 'GET' }),
                section: App.createHomeSection({ id: 'latest_update', title: 'Latest Update', type: HomeSectionType.singleRowNormal, containsMoreItems: true }),
                scope: 'latest_update'
            }
        ]

        for (const s of sections) {
            sectionCallback(s.section)
            const response = await this.requestManager.schedule(s.request, 1)
            const $ = require('cheerio').load(response.data as string)
            const items = parseMangaList({ $, scope: s.scope })
            s.section.items = items
            sectionCallback(s.section)
        }
    }

    override async getSearchTags(): Promise<TagSection[]> {
        // Belum ada halaman filter yang stabil, kembalikan kosong
        return []
    }

    override async getSearchResults(query: SearchRequest): Promise<PagedResults> {
        const params: string[] = ['page=1']
        const title = query.title?.trim()
        if (title) params.push(`s=${encodeURIComponent(title)}`)
        const request = createRequestObject({ url: `${BASE_URL}/contents?${params.join('&')}`, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const $ = require('cheerio').load(response.data as string)
        const results = parseMangaList({ $, scope: 'latest_update' })

        // Deteksi tombol next
        const hasNext = Boolean($('nav[aria-label="pagination"] a[rel="next"], a[aria-label="Next"]').length)
        return App.createPagedResults({
            results,
            metadata: hasNext ? { page: 2 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        if (homepageSectionId !== 'latest_update') throw new Error(`Invalid homepage section id: ${homepageSectionId}`)
        const request = createRequestObject({ url: `${BASE_URL}/contents?page=${page}`, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        const $ = require('cheerio').load(response.data as string)
        const results = parseMangaList({ $, scope: 'latest_update' })
        const hasNext = Boolean($('nav[aria-label="pagination"] a[rel="next"], a[aria-label="Next"]').length)
        return App.createPagedResults({ results, metadata: hasNext ? { page: page + 1 } : undefined })
    }
}