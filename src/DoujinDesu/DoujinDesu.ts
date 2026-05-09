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
    Tag,
    TagSection
} from '@paperback/types'
import * as cheerio from 'cheerio'
import { Element } from 'domhandler'

const BASE_URL = 'https://doujindesu.tv'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const TYPES = ['Doujinshi', 'Manga', 'Manhwa']

const MONTHS: Record<string, number> = {
    januari: 0,
    februari: 1,
    maret: 2,
    april: 3,
    mei: 4,
    juni: 5,
    juli: 6,
    agustus: 7,
    september: 8,
    oktober: 9,
    november: 10,
    desember: 11
}

export const DoujinDesuInfo: SourceInfo = {
    version: '5.0.0',
    name: 'DoujinDesu',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls adult manga from DoujinDesu',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: BASE_URL,
    sourceTags: [
        {
            text: 'Indonesian',
            type: BadgeColor.GREY
        },
        {
            text: '18+',
            type: BadgeColor.RED
        }
    ],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
}

const absoluteUrl = (url: string): string => {
    if (!url) return ''
    if (url.startsWith('http')) return url
    if (url.startsWith('//')) return `https:${url}`
    if (url.startsWith('/')) return `${BASE_URL}${url}`
    return `${BASE_URL}/${url}`
}

const slugFromMangaUrl = (url: string): string => absoluteUrl(url).replace(/\/$/, '').split('/').pop() ?? ''

const slugFromChapterUrl = (url: string): string => absoluteUrl(url).replace(/\/$/, '').split('/').pop() ?? ''

const imageFromElement = ($: cheerio.CheerioAPI, element: cheerio.Cheerio<Element>): string => {
    const srcset = element.attr('srcset') ?? ''
    return absoluteUrl(
        element.attr('data-src')
        || element.attr('data-lazy-src')
        || srcset.split(' ')[0]
        || element.attr('src')
        || ''
    )
}

const parseDate = (value: string): Date => {
    const match = value.toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i)
    if (!match) return new Date()

    const day = Number(match[1] ?? '1')
    const month = MONTHS[match[2] ?? ''] ?? 0
    const year = Number(match[3] ?? new Date().getFullYear())
    return new Date(year, month, day)
}

const parseStatus = (value: string): string => {
    const lower = value.toLowerCase()
    if (lower.includes('finished') || lower.includes('completed')) return 'Completed'
    if (lower.includes('publishing') || lower.includes('ongoing')) return 'Ongoing'
    return 'Unknown'
}

const getTableValue = ($: cheerio.CheerioAPI, label: string): string => {
    return $(`section.metadata td:contains(${label})`).filter((_, el) => $(el).text().trim() === label).first().next('td').text().trim().replace(/\s+/g, ' ')
}

const hasNextPage = ($: cheerio.CheerioAPI): boolean => $('nav.pagination li.last a').length > 0 || $('a.next.page-numbers').length > 0

export class DoujinDesu extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                const isImage = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(request.url) || request.url.includes('desu.photos') || request.url.includes('cdn.doujindesu')
                request.headers = {
                    ...(request.headers ?? {}),
                    'Accept': isImage ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
        return App.createRequest({
            url: absoluteUrl(url),
            method,
            data,
            headers
        })
    }

    private checkResponseError(response: Response): void {
        if (response.status === 403 || response.status === 503) {
            throw new Error(`CLOUDFLARE BYPASS ERROR:\nPlease open ${BASE_URL} with the cloud icon first.`)
        }
        if (response.status === 404) {
            throw new Error(`The requested page ${response.request.url} was not found.`)
        }
    }

    private parseMangaList($: cheerio.CheerioAPI): PartialSourceManga[] {
        const results: PartialSourceManga[] = []

        for (const element of $('#archives div.entries article.entry').toArray()) {
            const $entry = $(element)
            const href = $entry.find('a[href*="/manga/"]').first().attr('href') ?? ''
            const mangaId = slugFromMangaUrl(href)
            const title = $entry.find('h3.title').first().text().trim() || $entry.find('a').first().attr('title') || ''
            const image = imageFromElement($, $entry.find('figure.thumbnail img').first())
            const subtitle = $entry.find('div.artists span').first().text().trim()

            if (!mangaId || !title || !image) continue

            results.push(App.createPartialSourceManga({
                mangaId,
                image,
                title,
                subtitle
            }))
        }

        return results
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const response = await this.requestManager.schedule(this.createRequest(`/manga/${mangaId}/`), 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)

        const titleElement = $('section.metadata h1.title').first().clone()
        const alternativeTitle = titleElement.find('span.alter').text().trim()
        titleElement.find('span.alter').remove()
        const title = titleElement.text().trim().replace(/\s+/g, ' ')
        const titles = [title]
        if (alternativeTitle) titles.push(alternativeTitle)

        const author = getTableValue($, 'Author') || getTableValue($, 'Group') || 'Unknown'
        const artist = getTableValue($, 'Artist') || author
        const status = parseStatus(getTableValue($, 'Status'))
        const series = getTableValue($, 'Series') || getTableValue($, 'Serialization')
        const description = $('section.metadata div.pb-2').text().trim().replace(/\s+/g, ' ')
        const image = imageFromElement($, $('figure.thumbnail img').first())
        const tags: Tag[] = []

        for (const tag of $('section.metadata div.tags a').toArray()) {
            const label = $(tag).text().trim()
            const id = slugFromMangaUrl($(tag).attr('href') ?? '')
            if (id && label) tags.push(App.createTag({ id, label }))
        }

        const descParts = []
        if (description) descParts.push(description)
        if (alternativeTitle) descParts.push(`Judul Alternatif: ${alternativeTitle}`)
        if (series) descParts.push(`Seri: ${series}`)

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles,
                image,
                status,
                author,
                artist,
                desc: descParts.join('\n\n'),
                tags: [
                    App.createTagSection({
                        id: 'genres',
                        label: 'Genres',
                        tags
                    })
                ]
            })
        })
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const response = await this.requestManager.schedule(this.createRequest(`/manga/${mangaId}/`), 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)
        const chapters: Chapter[] = []
        let sortingIndex = 0

        for (const element of $('#chapter_list li').toArray()) {
            const $chapter = $(element)
            const href = $chapter.find('span.lchx a').first().attr('href') ?? $chapter.find('a[href*="chapter"]').first().attr('href') ?? ''
            const id = slugFromChapterUrl(href)
            const chapterText = $chapter.find('div.epsright chapter').first().text().trim() || $chapter.find('span.eps').first().text().trim()
            const chapNum = Number(chapterText.match(/\d+(?:\.\d+)?/)?.[0] ?? '0')
            const name = $chapter.find('span.lchx a').first().text().trim() || `Chapter ${chapterText}`
            const time = parseDate($chapter.find('span.date').first().text().trim())

            if (!id) continue

            chapters.push(App.createChapter({
                id,
                chapNum,
                name,
                time,
                langCode: '🇮🇩',
                sortingIndex: sortingIndex--
            }))
        }

        return chapters
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const chapterResponse = await this.requestManager.schedule(this.createRequest(`/${chapterId}/`), 1)
        this.checkResponseError(chapterResponse)
        const $ = cheerio.load(chapterResponse.data as string)
        const readerId = $('#reader').attr('data-id') ?? ''

        if (!readerId) throw new Error(`Unable to find reader id for ${chapterId}`)

        const pageResponse = await this.requestManager.schedule(this.createRequest('/themes/ajax/ch.php', 'POST', `id=${encodeURIComponent(readerId)}`, {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Accept': '*/*',
            'Referer': `${BASE_URL}/${chapterId}/`,
            'Origin': BASE_URL,
            'X-Requested-With': 'XMLHttpRequest'
        }), 1)
        this.checkResponseError(pageResponse)
        const _$ = cheerio.load(pageResponse.data as string)
        const pages = _$('img').toArray().map((img) => imageFromElement(_$, _$(img))).filter(Boolean)

        if (pages.length === 0) throw new Error(`Unable to find pages for ${chapterId}`)

        return App.createChapterDetails({
            id: chapterId,
            mangaId,
            pages
        })
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: this.createRequest('/manga/?type=Manga'),
                section: App.createHomeSection({
                    id: 'manga',
                    title: 'Manga',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            },
            {
                request: this.createRequest('/manga/?type=Manhwa'),
                section: App.createHomeSection({
                    id: 'manhwa',
                    title: 'Manhwa',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                })
            }
        ]

        for (const item of sections) {
            sectionCallback(item.section)
            const response = await this.requestManager.schedule(item.request, 1)
            this.checkResponseError(response)
            item.section.items = this.parseMangaList(cheerio.load(response.data as string))
            sectionCallback(item.section)
        }
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 2
        const type = homepageSectionId === 'manhwa' ? 'Manhwa' : 'Manga'
        const response = await this.requestManager.schedule(this.createRequest(`/manga/page/${page}/?type=${type}`), 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)

        return App.createPagedResults({
            results: this.parseMangaList($),
            metadata: hasNextPage($) ? { page: page + 1 } : undefined
        })
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const response = await this.requestManager.schedule(this.createRequest('/genre/'), 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)
        const genres: Tag[] = []

        for (const element of $('section#taxonomy div.entry a[href*="/genre/"]').toArray()) {
            const label = $(element).find('span.name').text().trim() || $(element).attr('title') || ''
            const id = slugFromMangaUrl($(element).attr('href') ?? '')
            if (id && label) genres.push(App.createTag({ id: `genre:${id}`, label }))
        }

        return [
            App.createTagSection({
                id: 'type',
                label: 'Type',
                tags: TYPES.map((type) => App.createTag({ id: `type:${type}`, label: type }))
            }),
            App.createTagSection({
                id: 'genre',
                label: 'Genres',
                tags: genres
            })
        ]
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
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
            results: this.parseMangaList($),
            metadata: hasNextPage($) ? { page: page + 1 } : undefined
        })
    }

    override async getCloudflareBypassRequestAsync(): Promise<Request> {
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

    override getCloudflareBypassRequest(): Request {
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

    override getMangaShareUrl(mangaId: string): string {
        return `${BASE_URL}/manga/${mangaId}/`
    }
}
