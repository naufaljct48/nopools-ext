import {
    BadgeColor,
    Chapter,
    ChapterDetails,
    ContentRating,
    HomeSection,
    HomeSectionType,
    PagedResults,
    PartialSourceManga,
    Request,
    Response,
    SearchRequest,
    Source,
    SourceInfo,
    SourceIntents,
    SourceManga,
    TagSection
} from '@paperback/types'
import * as cheerio from 'cheerio'

import { absoluteUrl, hasNextPage, slugFromUrl } from './DoujinDesuHelper'
import {
    parseChapterDetails,
    parseChapterList,
    parseMangaDetails,
    parseMangaList,
    parseSearchTags
} from './DoujinDesuParser'

const BASE_URL = 'https://doujindesu.tv'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

export const DoujinDesuInfo: SourceInfo = {
    version: '5.0.4',
    name: 'DoujinDesu',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls adult manga from DoujinDesu',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: BASE_URL,
    sourceTags: [
        { text: 'Indonesian', type: BadgeColor.GREY },
        { text: '18+', type: BadgeColor.RED }
    ],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

export class DoujinDesu extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(request.url)
                    || request.url.includes('desu.photos')
                    || request.url.includes('cdn.doujindesu')
                request.headers = {
                    ...(request.headers ?? {}),
                    'Accept': isImage
                        ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                        : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                    'Referer': `${BASE_URL}/`,
                    'Origin': BASE_URL,
                    'User-Agent': USER_AGENT,
                    'DNT': '1',
                    'Sec-GPC': '1'
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => response
        }
    })

    private createRequest(url: string, method = 'GET', data?: string, headers?: Record<string, string>): Request {
        return App.createRequest({ url: absoluteUrl(url), method, data, headers })
    }

    private checkResponseError(response: Response): void {
        if (response.status === 403 || response.status === 503) {
            throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease open ${BASE_URL} with the cloud icon first.`)
        }
        if (response.status === 404) {
            throw new Error(`The requested page ${response.request.url} was not found.`)
        }
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const response = await this.requestManager.schedule(this.createRequest(`/manga/${mangaId}/`), 1)
        this.checkResponseError(response)
        return parseMangaDetails(cheerio.load(response.data as string), mangaId)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const response = await this.requestManager.schedule(this.createRequest(`/manga/${mangaId}/`), 1)
        this.checkResponseError(response)
        return parseChapterList(cheerio.load(response.data as string), mangaId)
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const chapterResponse = await this.requestManager.schedule(this.createRequest(`/${chapterId}/`), 1)
        this.checkResponseError(chapterResponse)
        const $ = cheerio.load(chapterResponse.data as string)
        const readerId = $('#reader').attr('data-id') ?? ''

        if (!readerId) throw new Error(`Unable to find reader id for ${chapterId}`)

        const pageResponse = await this.requestManager.schedule(
            this.createRequest('/themes/ajax/ch.php', 'POST', `id=${encodeURIComponent(readerId)}`, {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': '*/*',
                'Referer': `${BASE_URL}/${chapterId}/`,
                'Origin': BASE_URL,
                'X-Requested-With': 'XMLHttpRequest'
            }), 1
        )
        this.checkResponseError(pageResponse)
        return parseChapterDetails(cheerio.load(pageResponse.data as string), mangaId, chapterId)
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: this.createRequest('/manga/?type=Manga'),
                section: App.createHomeSection({
                    id: 'manga', title: 'Manga',
                    type: HomeSectionType.singleRowNormal, containsMoreItems: true
                })
            },
            {
                request: this.createRequest('/manga/?type=Manhwa'),
                section: App.createHomeSection({
                    id: 'manhwa', title: 'Manhwa',
                    type: HomeSectionType.singleRowNormal, containsMoreItems: true
                })
            }
        ]

        for (const item of sections) {
            sectionCallback(item.section)
            const response = await this.requestManager.schedule(item.request, 1)
            this.checkResponseError(response)
            item.section.items = parseMangaList(cheerio.load(response.data as string))
            sectionCallback(item.section)
        }
    }

    async getHomePageSection(sectionCallback: (section: HomeSection) => void): Promise<void> {
        return this.getHomePageSections(sectionCallback)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 2
        const type = homepageSectionId === 'manhwa' ? 'Manhwa' : 'Manga'
        const response = await this.requestManager.schedule(
            this.createRequest(`/manga/page/${page}/?type=${type}`), 1
        )
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)

        return App.createPagedResults({
            results: parseMangaList($),
            metadata: hasNextPage($) ? { page: page + 1 } : undefined
        })
    }

    async getSearchTags(): Promise<TagSection[]> {
        const response = await this.requestManager.schedule(this.createRequest('/genre/'), 1)
        this.checkResponseError(response)
        return parseSearchTags(cheerio.load(response.data as string))
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const title = query.title?.trim() ?? ''
        const included = query.includedTags ?? []
        const typeTag = included.find((tag) => tag.id.startsWith('type:'))?.id.replace('type:', '')
        const genreTag = included.find((tag) => tag.id.startsWith('genre:'))?.id.replace('genre:', '')
        let path = page === 1 ? '/manga/' : `/manga/page/${page}/`

        if (title) {
            path = page === 1 ? `/?s=${encodeURIComponent(title)}` : `/page/${page}/?s=${encodeURIComponent(title)}`
        } else if (genreTag) {
            path = page === 1 ? `/genre/${genreTag}/` : `/genre/${genreTag}/page/${page}/`
        } else if (typeTag) {
            path = page === 1 ? `/manga/?type=${encodeURIComponent(typeTag)}` : `/manga/page/${page}/?type=${encodeURIComponent(typeTag)}`
        }

        const response = await this.requestManager.schedule(this.createRequest(path), 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)

        return App.createPagedResults({
            results: parseMangaList($),
            metadata: hasNextPage($) ? { page: page + 1 } : undefined
        })
    }

    async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: `${BASE_URL}/`,
            method: 'GET',
            headers: {
                'referer': `${BASE_URL}/`,
                'origin': `${BASE_URL}/`,
                'user-agent': USER_AGENT
            }
        })
    }

    getCloudflareBypassRequest(): Request {
        return App.createRequest({
            url: `${BASE_URL}/`,
            method: 'GET',
            headers: {
                'referer': `${BASE_URL}/`,
                'origin': `${BASE_URL}/`,
                'user-agent': USER_AGENT
            }
        })
    }

    getMangaShareUrl(mangaId: string): string {
        return `${BASE_URL}/manga/${mangaId}/`
    }
}
