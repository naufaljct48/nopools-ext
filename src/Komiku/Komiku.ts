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
import { createRequestObject, BASE_URL, API_URL } from './KomikuHelper'
import {
    parseMangaList,
    parseArticleCards,
    sliceBlock,
    parseMangaDetails,
    parseChapterList,
    parseChapterDetails,
    parseSearchTags
} from './KomikuParser'

export const KomikuInfo: SourceInfo = {
    version: '1.1.1',
    name: 'Komiku',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls manga from Komiku',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: BASE_URL,
    sourceTags: [{ text: 'Indonesian', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

const getTagValue = (query: SearchRequest, sectionId: string): string => {
    const tags = (query as any)?.includedTags as Array<{ id: string }> | undefined
    if (!Array.isArray(tags)) return ''
    for (const tag of tags) {
        const val = String(tag?.id ?? '')
        if (val.startsWith(`${sectionId}:`)) return val.replace(`${sectionId}:`, '')
    }
    return ''
}

export class Komiku extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 3,
        requestTimeout: 20000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const url = request.url || ''
                const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test(url) ||
                    url.includes('thumbnail.komiku.org') ||
                    url.includes('img.komiku.org')

                if (isImage) {
                    request.headers = {
                        ...(request.headers ?? {}),
                        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                        'Referer': `${BASE_URL}/`,
                    }
                } else {
                    request.headers = {
                        ...(request.headers ?? {}),
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Origin': BASE_URL,
                        'Referer': `${BASE_URL}/`,
                        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
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
            url: `${BASE_URL}/manga/${mangaId}/`
        })
        const response = await this.requestManager.schedule(request, 1)
        return parseMangaDetails(response.data as string, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({
            url: `${BASE_URL}/manga/${mangaId}/`
        })
        const response = await this.requestManager.schedule(request, 1)
        return parseChapterList(response.data as string, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // chapterId = "the-beginning-after-the-end-chapter-235"
        const request = createRequestObject({
            url: `${BASE_URL}/${chapterId}/`
        })
        const response = await this.requestManager.schedule(request, 1)
        return parseChapterDetails(response.data as string, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        // api.komiku.org cards link the landscape banner (manga_img_horizontal-*), which
        // Paperback has to blow up to fill a portrait tile. komiku.org/ and /daftar-komik/
        // link the real cover, so home sections are parsed from those instead.
        const homeSections = [
            {
                section: App.createHomeSection({
                    id: 'featured',
                    title: 'Peringkat Mingguan',
                    type: HomeSectionType.featured,
                    containsMoreItems: false
                }),
                blockId: 'rank-mingguan',
                endMarkers: ['id="rank-harian"', '</section>']
            },
            {
                section: App.createHomeSection({
                    id: 'latest_update',
                    title: 'Latest Update',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                }),
                blockId: 'Terbaru',
                endMarkers: ['<section']
            },
            {
                section: App.createHomeSection({
                    id: 'new_comics',
                    title: 'Baru Ditambahkan',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                }),
                blockId: 'Baru_Ditambahkan',
                endMarkers: ['<section']
            }
        ]

        const catalogSection = App.createHomeSection({
            id: 'catalog',
            title: 'Daftar Komik',
            type: HomeSectionType.singleRowNormal,
            containsMoreItems: true
        })

        for (const item of homeSections) sectionCallback(item.section)
        sectionCallback(catalogSection)

        try {
            const response = await this.requestManager.schedule(createRequestObject({ url: `${BASE_URL}/` }), 1)
            const html = response.data as string

            for (const item of homeSections) {
                const items = parseArticleCards(sliceBlock(html, item.blockId, item.endMarkers))
                item.section.items = item.section.id === 'featured' ? items.slice(0, 12) : items
                sectionCallback(item.section)
            }
        } catch (e) {
            console.log('Error loading homepage sections:', e)
        }

        try {
            const response = await this.requestManager.schedule(createRequestObject({ url: `${BASE_URL}/daftar-komik/` }), 1)
            catalogSection.items = parseArticleCards(response.data as string)
            sectionCallback(catalogSection)
        } catch (e) {
            console.log('Error loading section catalog:', e)
        }
    }

    override async getSearchTags(): Promise<TagSection[]> {
        return parseSearchTags()
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1

        let url: string

        if (query.title?.trim()) {
            // Text search: api.komiku.org/?post_type=manga&s=query&paged=N
            url = `${API_URL}/?post_type=manga&s=${encodeURIComponent(query.title.trim())}&paged=${page}`
        } else {
            // Filter search: api.komiku.org/manga/?orderby=X&tipe=X&genre=X&status=X&paged=N
            const genre = getTagValue(query, 'genre')
            const type = getTagValue(query, 'type')
            const status = getTagValue(query, 'status')
            const orderby = getTagValue(query, 'orderby') || 'modified'

            url = `${API_URL}/manga/?orderby=${orderby}&tipe=${type}&genre=${genre}&genre2=&status=${status}&paged=${page}`
        }

        const request = createRequestObject({ url })
        const response = await this.requestManager.schedule(request, 1)
        const results = parseMangaList(response.data as string)
        const hasMore = results.length >= 12

        return App.createPagedResults({
            results,
            metadata: hasMore ? { page: page + 1 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1

        // Only /daftar-komik/ paginates with real covers; the rest fall back to
        // api.komiku.org, whose banners get cropped to cover shape by toCoverUrl.
        if (homepageSectionId === 'catalog') {
            const request = createRequestObject({ url: `${BASE_URL}/daftar-komik/?halaman=${page}` })
            const response = await this.requestManager.schedule(request, 1)
            const results = parseArticleCards(response.data as string)

            return App.createPagedResults({
                results,
                metadata: results.length >= 50 ? { page: page + 1 } : undefined
            })
        }

        let url: string

        switch (homepageSectionId) {
            case 'latest_update':
                url = `${API_URL}/manga/?paged=${page}`
                break
            case 'new_comics':
                url = `${API_URL}/manga/?orderby=date&tipe=&genre=&genre2=&status=&paged=${page}`
                break
            default:
                throw new Error(`View more not supported for section: ${homepageSectionId}`)
        }

        const request = createRequestObject({ url })
        const response = await this.requestManager.schedule(request, 1)
        const results = parseMangaList(response.data as string)
        const hasMore = results.length >= 12

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
        return `${BASE_URL}/manga/${mangaId}`
    }
}
