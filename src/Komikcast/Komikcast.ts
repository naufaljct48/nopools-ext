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
import { BASE_URL, createRequestObject } from './KomikcastHelper'
import {
    parseChapterDetails,
    parseChapterList,
    parseMangaDetails,
    parseMangaList,
    parseSearchTags
} from './KomikcastParser'

const getTagValues = (query: SearchRequest, prefix: string): string[] => {
    const tags = (query as any)?.includedTags as Array<{ id: string }> | undefined
    if (!Array.isArray(tags)) return []
    const out: string[] = []
    for (const t of tags) {
        const val = String(t?.id ?? '')
        if (val.startsWith(prefix)) out.push(val.replace(prefix, ''))
    }
    return out
}

export const KomikcastInfo: SourceInfo = {
    version: '5.0.0',
    name: 'Komikcast',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls manga from Komikcast (komikcast.info)',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: BASE_URL,
    sourceTags: [{ text: 'Indonesian', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI
}

export class Komikcast extends Source {
    private inertiaVersion: string | null = null

    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test((request.url || '').split('?')[0] ?? '')
                if (isImage) {
                    const headers: Record<string, string> = {
                        ...(request.headers ?? {}),
                        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                        'Referer': `${BASE_URL}/`
                    }
                    // direct-stor.berkasdrive.com returns 403 when Origin is sent on image GETs
                    delete headers['Origin']
                    delete headers['origin']
                    request.headers = headers
                } else {
                    request.headers = {
                        ...(request.headers ?? {}),
                        'Referer': `${BASE_URL}/`,
                        'Origin': BASE_URL
                    }
                }
                return request
            },
            interceptResponse: async (response: Response): Promise<Response> => {
                return response
            }
        }
    })

    private async fetchInertiaProps(pathAndQuery: string): Promise<any> {
        const url = `${BASE_URL}${pathAndQuery}`

        // Fast JSON path when we already know the current Inertia asset version
        if (this.inertiaVersion) {
            const req = createRequestObject({
                url,
                headers: {
                    'Accept': 'text/html, application/xhtml+xml',
                    'X-Inertia': 'true',
                    'X-Inertia-Version': this.inertiaVersion,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
            const res = await this.requestManager.schedule(req, 1)
            if (res.status === 403 || res.status === 503) {
                throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${BASE_URL}> and press the cloud icon.`)
            }
            if (res.status === 200) {
                const raw = String(res.data ?? '').trim()
                if (raw.startsWith('{')) {
                    try {
                        const page = JSON.parse(raw)
                        if (page?.version) this.inertiaVersion = String(page.version)
                        if (page?.props) return page.props
                    } catch {
                        // Fall through to full HTML parse
                    }
                }
            }
            // 409 or non-JSON: reset version and fall back to HTML
            this.inertiaVersion = null
        }

        const htmlReq = createRequestObject({ url })
        const htmlRes = await this.requestManager.schedule(htmlReq, 1)
        if (htmlRes.status === 403 || htmlRes.status === 503) {
            throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease go to the homepage of <${BASE_URL}> and press the cloud icon.`)
        }

        const $ = this.cheerio.load(String(htmlRes.data ?? ''))
        const dataPage = $('#app').attr('data-page')
        if (!dataPage) {
            throw new Error(`Failed to parse Komikcast page data at ${pathAndQuery}`)
        }

        const page = JSON.parse(dataPage)
        if (page?.version) this.inertiaVersion = String(page.version)
        return page?.props ?? {}
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const props = await this.fetchInertiaProps(`/manga/${encodeURIComponent(mangaId)}`)
        return parseMangaDetails(props?.manga ?? {}, mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const props = await this.fetchInertiaProps(`/manga/${encodeURIComponent(mangaId)}`)
        return parseChapterList(props?.manga?.chapters ?? [], mangaId)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const props = await this.fetchInertiaProps(`/manga/${encodeURIComponent(mangaId)}/chapter/${encodeURIComponent(chapterId)}`)
        return parseChapterDetails(props?.chapter ?? {}, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const popularSection = App.createHomeSection({
            id: 'popular',
            title: 'Popular',
            type: HomeSectionType.featured,
            containsMoreItems: true
        })
        const latestSection = App.createHomeSection({
            id: 'latest_update',
            title: 'Latest Update',
            type: HomeSectionType.singleRowNormal,
            containsMoreItems: true
        })

        sectionCallback(popularSection)
        sectionCallback(latestSection)

        try {
            const homeProps = await this.fetchInertiaProps('/')
            popularSection.items = parseMangaList(homeProps?.popularManga ?? [])
            sectionCallback(popularSection)
        } catch (error) {
            console.log('Error loading section popular:', error)
        }

        try {
            const latestProps = await this.fetchInertiaProps('/manga?sort=latest&page=1')
            latestSection.items = parseMangaList(latestProps?.mangas?.data ?? [])
            sectionCallback(latestSection)
        } catch (error) {
            console.log('Error loading section latest_update:', error)
        }
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const props = await this.fetchInertiaProps('/manga')
        return parseSearchTags(props?.genres ?? [])
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = Number(metadata?.page ?? 1)
        const params: string[] = [`page=${page}`]

        const title = query.title?.trim()
        if (title) params.push(`search=${encodeURIComponent(title)}`)

        const genre = getTagValues(query, 'genre:')[0]
        if (genre) params.push(`genre=${encodeURIComponent(genre)}`)

        const type = getTagValues(query, 'type:')[0]
        if (type) params.push(`type=${encodeURIComponent(type)}`)

        const status = getTagValues(query, 'status:')[0]
        if (status) params.push(`status=${encodeURIComponent(status)}`)

        const sort = getTagValues(query, 'sort:')[0]
        if (sort) params.push(`sort=${encodeURIComponent(sort)}`)

        const props = await this.fetchInertiaProps(`/manga?${params.join('&')}`)
        const mangas = props?.mangas ?? {}
        const results = parseMangaList(mangas?.data ?? [])
        const current = Number(mangas?.current_page ?? page)
        const last = Number(mangas?.last_page ?? page)

        return App.createPagedResults({
            results,
            metadata: current < last ? { page: current + 1 } : undefined
        })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = Number(metadata?.page ?? 1)
        let sort = 'latest'
        if (homepageSectionId === 'popular') sort = 'popular'
        else if (homepageSectionId !== 'latest_update') {
            throw new Error(`View more not supported for section: ${homepageSectionId}`)
        }

        const props = await this.fetchInertiaProps(`/manga?sort=${sort}&page=${page}`)
        const mangas = props?.mangas ?? {}
        const results = parseMangaList(mangas?.data ?? [])
        const current = Number(mangas?.current_page ?? page)
        const last = Number(mangas?.last_page ?? page)

        return App.createPagedResults({
            results,
            metadata: current < last ? { page: current + 1 } : undefined
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
