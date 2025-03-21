import {
    Source,
    Manga,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    SourceInfo,
    TagSection,
    ContentRating,
    BadgeColor,
    SourceIntents,
    Request,
    Response
} from '@paperback/types'

const API_URL = 'https://api.shngm.io'
const CDN_URL = 'https://storage.shngm.id'
const BASE_URL = 'https://app.shinigami.asia'

export const ShinigamiInfo: SourceInfo = {
    version: '1.0.2',
    name: 'Shinigami',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls manga from Shinigami',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: BASE_URL,
    sourceTags: [
        {
            text: 'Indonesian',
            type: BadgeColor.GREY
        }
    ],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS
}

export class Shinigami extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    async getMangaDetails(mangaId: string): Promise<Manga> {
        const request = createRequestObject({
            url: `${API_URL}/v1/manga/detail/${mangaId}`,
            method: 'GET',
            headers: this.constructHeaders()
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data)

        if (data.retcode !== 0) {
            throw new Error('Failed to get manga details')
        }

        const mangaInfo = data.data
        const taxonomy = mangaInfo.taxonomy

        return createManga({
            id: mangaInfo.manga_id,
            titles: [mangaInfo.title, mangaInfo.alternative_title].filter(Boolean),
            image: mangaInfo.cover_portrait_url || mangaInfo.cover_image_url,
            status: this.parseStatus(mangaInfo.status),
            author: this.getTaxonomyNames(taxonomy, 'Author'),
            artist: this.getTaxonomyNames(taxonomy, 'Artist'),
            desc: mangaInfo.description,
            tags: [
                createTagSection({
                    id: 'genres',
                    label: 'Genres',
                    tags: this.parseTaxonomyTags(taxonomy, 'Genre')
                })
            ]
        })
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({
            url: `${API_URL}/v1/chapter/${mangaId}/list`,
            param: '?page=1&page_size=3000&sort_by=chapter_number&sort_order=desc',
            method: 'GET',
            headers: this.constructHeaders()
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data)

        if (data.retcode !== 0) return []

        return data.data.map((chapter: any) => {
            return createChapter({
                id: chapter.chapter_id,
                mangaId: mangaId,
                chapNum: chapter.chapter_number,
                name: `Chapter ${chapter.chapter_number}`,
                time: new Date(chapter.release_date),
                langCode: 'id'
            })
        })
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = createRequestObject({
            url: `${API_URL}/v1/chapter/detail/${chapterId}`,
            method: 'GET',
            headers: this.constructHeaders()
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data)

        if (data.retcode !== 0) {
            throw new Error('Failed to get chapter details')
        }

        const chapter = data.data.chapter
        return createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: chapter.data.map((page: string) => `${CDN_URL}${chapter.path}${page}`)
        })
    }

    private constructHeaders(): Record<string, string> {
        return {
            'Accept': 'application/json',
            'Origin': BASE_URL,
            'DNT': '1',
            'Sec-GPC': '1'
        }
    }

    private getTaxonomyNames(taxonomy: any, key: string): string {
        return taxonomy[key]?.map((item: any) => item.name).join(', ') ?? ''
    }

    private parseTaxonomyTags(taxonomy: any, key: string): any[] {
        return (taxonomy[key] ?? []).map((item: any) => createTag({
            id: item.id.toString(),
            label: item.name
        }))
    }

    private parseStatus(status: number): string {
        switch (status) {
            case 1: return 'Ongoing'
            case 2: return 'Completed'
            default: return 'Unknown'
        }
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: createRequestObject({
                    url: `${API_URL}/v1/manga/list?type=project&page=1&page_size=30&is_featured=true`,
                    method: 'GET',
                    headers: this.constructHeaders()
                }),
                section: createHomeSection({
                    id: 'latest',
                    title: 'Latest Updates',
                    view_more: true,
                }),
            },
            {
                request: createRequestObject({
                    url: `${API_URL}/v1/manga/list?format=manhwa&page=1&page_size=10&is_recommended=true`,
                    method: 'GET',
                    headers: this.constructHeaders()
                }),                
                section: createHomeSection({
                    id: 'featured',
                    title: 'Featured Series',
                    view_more: true,
                }),
            }
        ]

        for (const section of sections) {
            sectionCallback(section.section)
            const response = await this.requestManager.schedule(section.request, 1)
            const data = JSON.parse(response.data)

            if (data.retcode !== 0) continue

            section.section.items = data.data.map((item: any) => ({
                id: item.manga_id.toString(),
                image: item.cover_image_url ?? '',
                title: item.title ?? '',
                subtitle: `Latest: Chapter ${item.latest_chapter?.chapter_number ?? 'N/A'}`
            }))
            sectionCallback(section.section)
        }
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        let param = ''

        switch (homepageSectionId) {
            case 'latest':
                param = 'sort=latest&sort_order=desc'
                break
            case 'featured':
                param = 'is_featured=true'
                break
            default:
                throw new Error(`Invalid homepage section ID: ${homepageSectionId}`)
        }

        const request = createRequestObject({
            url: `${API_URL}/v1/manga/list?type=project&page=${page}&page_size=30&is_update=true&${param}`,
            method: 'GET',
            headers: this.constructHeaders()
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data)

        if (data.retcode !== 0) {
            return createPagedResults({
                results: [],
                metadata: { page: page + 1 }
            })
        }

        const meta = data.meta
        const manga = data.data.map((item: any) => ({
            id: item.manga_id.toString(),
            image: item.cover_image_url ?? '',
            title: item.title ?? '',
            subtitle: `Latest: Chapter ${item.latest_chapter?.chapter_number ?? 'N/A'}`
        }))

        return createPagedResults({
            results: manga,
            metadata: {
                page: page + 1,
                hasNextPage: meta.page < meta.total_page
            }
        })
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        let url = `${API_URL}/v1/manga/list?type=project&page=${page}&page_size=30&is_update=true&sort=latest&sort_order=desc`

        if (query.title) {
            url += `&q=${encodeURIComponent(query.title)}`
        }

        const request = createRequestObject({
            url,
            method: 'GET',
            headers: this.constructHeaders()
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data)

        if (data.retcode !== 0) {
            return createPagedResults({
                results: [],
                metadata: { page: page + 1 }
            })
        }

        const meta = data.meta
        const manga = data.data.map((item: any) => ({
            id: item.manga_id.toString(),
            image: item.cover_image_url ?? '',
            title: item.title ?? '',
            subtitle: `Latest: Chapter ${item.latest_chapter?.chapter_number ?? 'N/A'}`
        }))

        return createPagedResults({
            results: manga,
            metadata: {
                page: page + 1,
                hasNextPage: meta.page < meta.total_page
            }
        })
    }
}

// Helper functions
function createRequestObject(requestObj: any): Request {
    return App.createRequest({
        ...requestObj,
        headers: {
            ...(requestObj.headers ?? {}),
        }
    })
}

function createManga(mangaObj: any): Manga {
    return App.createSourceManga(mangaObj)
}

function createChapter(chapterObj: any): Chapter {
    return App.createChapter(chapterObj)
}

function createChapterDetails(detailsObj: any): ChapterDetails {
    return App.createChapterDetails(detailsObj)
}

function createTagSection(tagSectionObj: any): TagSection {
    return App.createTagSection(tagSectionObj)
}

function createTag(tagObj: any): any {
    return App.createTag(tagObj)
}

function createHomeSection(section: any): HomeSection {
    return App.createHomeSection(section)
}

function createPagedResults(results: any): PagedResults {
    return App.createPagedResults(results)
}