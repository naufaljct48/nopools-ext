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
import { API_URL, BASE_URL, createRequestObject } from './ShinigamiHelper'
import { parseChapterDetails, parseChapterList, parseMangaDetails, parseMangaList } from './ShinigamiParser'

const PAGE_SIZE = 24

export const ShinigamiInfo: SourceInfo = {
    version: '1.3.0',
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
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

export class Shinigami extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test((request.url || '').split('?')[0] ?? '')
                    || /cdn\.shinigami\.gg|assets\.shngm\.id/i.test(request.url || '')

                if (isImage) {
                    request.headers = {
                        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                        'DNT': '1',
                        'Referer': `${BASE_URL}/`,
                        'Sec-GPC': '1',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
                    }
                } else {
                    request.headers = {
                        'Accept': 'application/json',
                        'Origin': BASE_URL,
                        'Referer': `${BASE_URL}/`,
                        'DNT': '1',
                        'Sec-GPC': '1',
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

    private async apiGet(pathAndQuery: string): Promise<any> {
        const request = createRequestObject({
            url: `${API_URL}${pathAndQuery}`,
            method: 'GET'
        })
        const response = await this.requestManager.schedule(request, 1)
        if (response.status === 403 || response.status === 503) {
            throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${BASE_URL}> and press the cloud icon.`)
        }
        return JSON.parse(response.data as string)
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const data = await this.apiGet(`/v1/manga/detail/${encodeURIComponent(mangaId)}`)
        if (data.retcode !== 0) {
            throw new Error(`Failed to get manga details: ${data.message ?? 'unknown error'}`)
        }
        return parseMangaDetails(data, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const allChapters: any[] = []
        let cursor = ''
        const maxPages = 30

        for (let i = 0; i < maxPages; i++) {
            const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
            const data = await this.apiGet(`/v1/chapter/${encodeURIComponent(mangaId)}/list?limit=100&sort_by=chapter_number&sort_order=desc${cursorParam}`)
            if (data.retcode !== 0) break

            const batch = Array.isArray(data.data) ? data.data : []
            allChapters.push(...batch)

            const nextCursor = String(data?.meta?.next_cursor ?? '')
            if (!data?.meta?.has_next || !nextCursor || nextCursor === cursor || batch.length === 0) {
                break
            }
            cursor = nextCursor
        }

        return parseChapterList(allChapters, mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const data = await this.apiGet(`/v1/chapter/detail/${encodeURIComponent(chapterId)}`)
        if (data.retcode !== 0) {
            throw new Error(`Failed to get chapter details: ${data.message ?? 'unknown error'}`)
        }
        return parseChapterDetails(data, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                path: `/v1/manga/list?type=project&limit=${PAGE_SIZE}&offset=0&is_update=true&sort=latest&sort_order=desc`,
                section: App.createHomeSection({
                    id: 'latest',
                    title: 'Project Updates',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                path: '/v1/manga/list?format=manhwa&limit=10&offset=0&is_recommended=true',
                section: App.createHomeSection({
                    id: 'featured',
                    title: 'Featured Series',
                    type: HomeSectionType.featured,
                    containsMoreItems: true
                })
            },
            {
                path: '/v1/manga/list?type=mirror&limit=15&offset=0&is_update=true&sort=latest&sort_order=desc',
                section: App.createHomeSection({
                    id: 'mirror',
                    title: 'Mirror Project',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                path: `/v1/manga/list?limit=${PAGE_SIZE}&offset=0&format=manga&sort=popularity&sort_order=desc`,
                section: App.createHomeSection({
                    id: 'manga',
                    title: 'Popular Manga',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                path: `/v1/manga/list?limit=${PAGE_SIZE}&offset=0&format=manhua&sort=popularity&sort_order=desc`,
                section: App.createHomeSection({
                    id: 'manhua',
                    title: 'Popular Manhua',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            }
        ]

        for (const item of sections) {
            sectionCallback(item.section)
            try {
                const data = await this.apiGet(item.path)
                if (data.retcode !== 0) continue
                item.section.items = parseMangaList(data)
                sectionCallback(item.section)
            } catch (error) {
                console.log(`Error loading section ${item.section.id}:`, error)
            }
        }
    }

    private async fetchTaxonomyList(type: string): Promise<any[]> {
        const items: any[] = []
        let offset = 0
        const limit = 100

        for (let i = 0; i < 10; i++) {
            const data = await this.apiGet(`/v1/taxonomy/list?type=${encodeURIComponent(type)}&limit=${limit}&offset=${offset}`)
            if (data.retcode !== 0) break
            const batch = Array.isArray(data.data) ? data.data : []
            items.push(...batch)
            if (!data?.meta?.has_next || batch.length === 0) break
            offset += batch.length
        }

        return items
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const [genresRaw, formatsRaw] = await Promise.all([
            this.fetchTaxonomyList('genre'),
            this.fetchTaxonomyList('format')
        ])

        const tags: TagSection[] = []

        if (genresRaw.length > 0) {
            tags.push(App.createTagSection({
                id: 'genres',
                label: 'Genres',
                tags: genresRaw
                    .filter((item: any) => item?.slug && item?.name)
                    .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))
                    .map((item: any) => App.createTag({
                        id: `genre:${item.slug}`,
                        label: item.name
                    }))
            }))
        }

        if (formatsRaw.length > 0) {
            tags.push(App.createTagSection({
                id: 'formats',
                label: 'Formats',
                tags: formatsRaw
                    .filter((item: any) => item?.slug && item?.name)
                    .map((item: any) => App.createTag({
                        id: `format:${item.slug}`,
                        label: item.name
                    }))
            }))
        }

        tags.push(App.createTagSection({
            id: 'status',
            label: 'Status',
            tags: [
                { id: 'status:ongoing', label: 'Ongoing' },
                { id: 'status:completed', label: 'Completed' },
                { id: 'status:hiatus', label: 'Hiatus' }
            ].map(t => App.createTag(t))
        }))

        return tags
    }

    private getTagSlugs(query: SearchRequest, prefix: string): string[] {
        const tags = (query as any)?.includedTags as Array<{ id: string }> | undefined
        if (!Array.isArray(tags)) return []

        const slugs: string[] = []
        for (const tag of tags) {
            const value = String(tag?.id ?? '')
            if (value.startsWith(`${prefix}:`)) slugs.push(value.replace(`${prefix}:`, ''))
        }
        return slugs
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const offset: number = Number(metadata?.offset ?? 0)

        const params = [
            `limit=${PAGE_SIZE}`,
            `offset=${offset}`,
            'sort=popularity',
            'sort_order=desc'
        ]

        const title = query.title?.trim()
        if (title) {
            params.push(`q=${encodeURIComponent(title)}`)
        }

        const genres = this.getTagSlugs(query, 'genre')
        if (genres.length) {
            params.push(`genre=${genres.map(slug => encodeURIComponent(slug)).join(',')}`)
        }

        const formats = this.getTagSlugs(query, 'format')
        if (formats.length) {
            params.push(`format=${formats.map(slug => encodeURIComponent(slug)).join(',')}`)
        }

        const status = this.getTagSlugs(query, 'status')[0]
        if (status) {
            params.push(`status=${encodeURIComponent(status)}`)
        }

        const data = await this.apiGet(`/v1/manga/list?${params.join('&')}`)
        if (data.retcode !== 0) {
            return App.createPagedResults({ results: [] })
        }

        const results = parseMangaList(data)
        const hasMore = Boolean(data?.meta?.has_next) && results.length > 0

        return App.createPagedResults({
            results,
            metadata: hasMore ? { offset: offset + results.length } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const offset: number = Number(metadata?.offset ?? 0)
        let query = ''

        switch (homepageSectionId) {
            case 'latest':
                query = `type=project&limit=${PAGE_SIZE}&offset=${offset}&is_update=true&sort=latest&sort_order=desc`
                break
            case 'featured':
                query = `format=manhwa&limit=${PAGE_SIZE}&offset=${offset}&is_recommended=true`
                break
            case 'mirror':
                query = `type=mirror&limit=${PAGE_SIZE}&offset=${offset}&is_update=true&sort=latest&sort_order=desc`
                break
            case 'manga':
                query = `limit=${PAGE_SIZE}&offset=${offset}&format=manga&sort=popularity&sort_order=desc`
                break
            case 'manhua':
                query = `limit=${PAGE_SIZE}&offset=${offset}&format=manhua&sort=popularity&sort_order=desc`
                break
            default:
                throw new Error(`Invalid homepage section id: ${homepageSectionId}`)
        }

        const data = await this.apiGet(`/v1/manga/list?${query}`)
        if (data.retcode !== 0) {
            return App.createPagedResults({ results: [] })
        }

        const results = parseMangaList(data)
        const hasMore = Boolean(data?.meta?.has_next) && results.length > 0

        return App.createPagedResults({
            results,
            metadata: hasMore ? { offset: offset + results.length } : undefined
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
