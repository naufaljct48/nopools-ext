import {
    BadgeColor,
    ContentRating,
    SourceInfo,
    SourceIntents,
    Request,
    Response,
    Tag,
    TagSection,
    PartialSourceManga,
    SourceManga,
    Chapter,
    ChapterDetails,
    HomeSection,
    HomeSectionType
} from '@paperback/types'

import { MangaStream } from '../MangaStream'
import { 
    ShinigamiBrowseResponse,
    ShinigamiMangaDetailResponse,
    ShinigamiChapterListResponse,
    ShinigamiPageListResponse
} from './ShinigamiInterfaces'

const DOMAIN = 'https://app.shinigami.asia'
const API_DOMAIN = 'https://api.shngm.io'
const CDN_DOMAIN = 'https://storage.shngm.id'
const API_BASE_PATH = 'v1'

export const ShinigamiInfo: SourceInfo = {
    version: getExportVersion('0.0.9'),
    name: 'Shinigami',
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: 'NaufalJCT48',
    authorWebsite: 'http://github.com/NaufalJCT48',
    icon: 'icon.png',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
    sourceTags: [
        {
            text: "Indonesia",
            type: BadgeColor.GREY
        }
    ]
}

export class Shinigami extends MangaStream {
    baseUrl = DOMAIN
    language = '🇮🇩'
    
    constructor() {
        super()
        this.requestManager = App.createRequestManager({
            requestsPerSecond: 5,
            requestTimeout: 15000,
            interceptor: {
                interceptRequest: async (request: Request): Promise<Request> => {
                    const isImageRequest = request.url.includes(CDN_DOMAIN) || request.url.includes('resize')

                    request.headers = {
                        ...(request.headers ?? {}),
                        'DNT': '1',
                        'Origin': DOMAIN,
                        'Sec-GPC': '1',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': isImageRequest 
                            ? 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                            : 'application/json'
                    }
                    return request
                },
                interceptResponse: async (response: Response): Promise<Response> => {
                    if (response.status === 404) {
                        throw new Error(`The requested page ${response.request.url} was not found!`)
                    }
                    return response
                }
            }
        })
    }

    override async getHomePageSections(): Promise<HomeSection[]> {
        const sections: HomeSection[] = [
            App.createHomeSection({
                id: 'popular',
                title: 'Popular',
                type: HomeSectionType.featured,
                containsMoreItems: true
            }),
            App.createHomeSection({
                id: 'latest',
                title: 'Latest Updates',
                type: HomeSectionType.singleRowNormal,
                containsMoreItems: true
            })
        ]

        try {
            const promises = sections.map(async (section) => {
                const sortParam = section.id === 'popular' ? 'view_count' : 'updated_at'
                const orderParam = 'desc'

                const request = App.createRequest({
                    url: `${API_DOMAIN}/${API_BASE_PATH}/manga/list`,
                    method: 'GET',
                    param: `?page=1&page_size=30&sort=${sortParam}&order=${orderParam}`
                })

                const response = await this.requestManager.schedule(request, 1)
                const result = JSON.parse(response.data as string) as ShinigamiBrowseResponse

                if (result.data && Array.isArray(result.data)) {
                    section.items = result.data.map(item => App.createPartialSourceManga({
                        mangaId: item.manga_id ?? '',
                        image: item.cover_image_url ?? item.cover_portrait_url ?? '',
                        title: item.title ?? '',
                        subtitle: `Views: ${item.view_count?.toLocaleString() ?? 0}`
                    }))
                }

                return section
            })

            const resolvedSections = await Promise.all(promises)
            return resolvedSections.filter(section => section.items && section.items.length > 0)
        } catch (error) {
            console.log(`Error getting home page sections: ${error}`)
            return []
        }
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = App.createRequest({
            url: `${API_DOMAIN}/${API_BASE_PATH}/manga/detail/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const result = JSON.parse(response.data as string) as ShinigamiMangaDetailResponse
        const data = result.data

        const tags: Tag[] = []
        if (data.taxonomy.Genre) {
            data.taxonomy.Genre.forEach(genre => {
                tags.push(App.createTag({
                    id: genre.name,
                    label: genre.name
                }))
            })
        }

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [data.title ?? ''],
                image: data.thumbnail ?? '',
                status: data.status === 1 ? 'Ongoing' : 'Completed',
                author: data.taxonomy.Author?.map(x => x.name).join(', ') ?? 'Unknown',
                artist: data.taxonomy.Artist?.map(x => x.name).join(', ') ?? 'Unknown',
                tags: [App.createTagSection({ id: '0', label: 'genres', tags: tags })],
                desc: data.description ?? ''
            })
        })
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = App.createRequest({
            url: `${API_DOMAIN}/${API_BASE_PATH}/chapter/${mangaId}/list?page_size=5000`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const result = JSON.parse(response.data as string) as ShinigamiChapterListResponse

        return result.chapterList.map(chapter => {
            return App.createChapter({
                id: chapter.chapterId,
                mangaId: mangaId,
                name: `Chapter ${chapter.name.toString().replace('.0', '')} ${chapter.title}`,
                langCode: '🇮🇩',
                chapNum: Number(chapter.name),
                time: new Date(chapter.date).getTime()
            })
        })
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = App.createRequest({
            url: `${API_DOMAIN}/${API_BASE_PATH}/chapter/detail/${chapterId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const result = JSON.parse(response.data as string) as ShinigamiPageListResponse

        const pages = result.pageList.chapterPage.pages
            .filter(page => !page.startsWith('999-'))
            .map(page => {
                const originalUrl = `${CDN_DOMAIN}${result.pageList.chapterPage.path}${page}`
                return `https://resize${originalUrl}`
            })

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: false
        })
    }

    override async getSearchResults(query: string, metadata: any): Promise<PartialSourceManga[]> {
        const page = metadata?.page ?? 1
        const request = App.createRequest({
            url: `${API_DOMAIN}/${API_BASE_PATH}/manga/list`,
            method: 'GET',
            param: `?page=${page}&page_size=30${query ? `&q=${encodeURIComponent(query)}` : ''}`
        })

        const response = await this.requestManager.schedule(request, 1)
        const result = JSON.parse(response.data as string) as ShinigamiBrowseResponse

        const manga = result.data.map(item => App.createPartialSourceManga({
            mangaId: item.manga_id ?? '',
            image: item.cover_image_url ?? item.cover_portrait_url ?? '',
            title: item.title ?? ''
        }))

        metadata = result.meta.page < result.meta.total_page ? { page: page + 1 } : undefined
        return App.createPagedResults({
            results: manga,
            metadata
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PartialSourceManga[]> {
        const page = metadata?.page ?? 1
        const sortParam = homepageSectionId === 'popular' ? 'view_count' : 'updated_at'
        const orderParam = 'desc'

        const request = App.createRequest({
            url: `${API_DOMAIN}/${API_BASE_PATH}/manga/list`,
            method: 'GET',
            param: `?page=${page}&page_size=30&sort=${sortParam}&order=${orderParam}`
        })

        const response = await this.requestManager.schedule(request, 1)
        const result = JSON.parse(response.data as string) as ShinigamiBrowseResponse

        const manga = result.data.map(item => App.createPartialSourceManga({
            mangaId: item.manga_id ?? '',
            image: item.cover_image_url ?? item.cover_portrait_url ?? '',
            title: item.title ?? ''
        }))

        metadata = result.meta.page < result.meta.total_page ? { page: page + 1 } : undefined
        return App.createPagedResults({
            results: manga,
            metadata
        })
    }
}