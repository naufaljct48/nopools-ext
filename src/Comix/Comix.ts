import { BadgeColor, Chapter, ChapterDetails, ContentRating, HomeSection, HomeSectionType, PagedResults, Request, Response, SearchRequest, Source, SourceInfo, SourceIntents, SourceManga, TagSection } from '@paperback/types'
import { API_TOKEN, API_URL, BASE_URL, CHAPTER_TOKEN, createRequestObject } from './ComixHelper'
import { parseChapterDetails, parseChapterList, parseMangaDetails, parseMangaList, parseSearchTags } from './ComixParser'

export const ComixInfo: SourceInfo = {
    version: '1.0.1',
    name: 'Comix.to',
    icon: 'icon.png',
    author: 'NaufalJCT48',
    authorWebsite: 'https://github.com/naufaljct48',
    description: 'Extension that pulls comics from Comix.to',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: BASE_URL,
    sourceTags: [{ text: 'English', type: BadgeColor.GREY }],
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.SETTINGS_UI,
}

export class Comix extends Source {
    requestManager = App.createRequestManager({
        requestsPerSecond: 4,
        requestTimeout: 15000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => request,
            interceptResponse: async (response: Response): Promise<Response> => response
        }
    })

    private async getJSON(url: string): Promise<any> {
        const response = await this.requestManager.schedule(createRequestObject({ url, method: 'GET' }), 1)
        const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
        if (data?.status === 'ok' && 'result' in data) return data.result
        if (data?.status === 'error') throw new Error(data.message ?? 'Comix API error')
        return data
    }

    override async getMangaDetails(mangaId: string): Promise<SourceManga> {
        return parseMangaDetails(await this.getJSON(`${API_URL}/manga/${mangaId}`), mangaId)
    }

    override async getChapters(mangaId: string): Promise<Chapter[]> {
        const data = await this.getJSON(`${API_URL}/manga/${mangaId}/chapters?page=1&limit=500&order%5Bnumber%5D=desc&_=${API_TOKEN}`)
        return parseChapterList(data)
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const data = await this.getJSON(`${API_URL}/chapters/${chapterId}?_=${CHAPTER_TOKEN}`)
        return parseChapterDetails(data, mangaId, chapterId)
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            { id: 'trending', title: 'Trending', url: `${API_URL}/manga?limit=24&sort=views_7d:desc` },
            { id: 'latest', title: 'Latest Updates', url: `${API_URL}/manga?limit=24&sort=chapter_updated_at:desc` }
        ]
        for (const s of sections) {
            const section = App.createHomeSection({ id: s.id, title: s.title, type: HomeSectionType.singleRowNormal, containsMoreItems: true })
            sectionCallback(section)
            section.items = parseMangaList(await this.getJSON(s.url))
            sectionCallback(section)
        }
    }

    override async getSearchTags(): Promise<TagSection[]> { return parseSearchTags() }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const params = [`page=${page}`, 'limit=24']
        if (query.title) params.push(`q=${encodeURIComponent(query.title)}`)
        for (const tag of query.includedTags ?? []) {
            if (tag.id.startsWith('type:')) params.push(`types=${encodeURIComponent(tag.id.replace('type:', ''))}`)
            if (tag.id.startsWith('status:')) params.push(`status=${encodeURIComponent(tag.id.replace('status:', ''))}`)
        }
        const results = parseMangaList(await this.getJSON(`${API_URL}/manga?${params.join('&')}`))
        return App.createPagedResults({ results, metadata: results.length >= 24 ? { page: page + 1 } : undefined })
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1
        const sort = homepageSectionId === 'trending' ? 'views_7d:desc' : 'chapter_updated_at:desc'
        const results = parseMangaList(await this.getJSON(`${API_URL}/manga?page=${page}&limit=24&sort=${encodeURIComponent(sort)}`))
        return App.createPagedResults({ results, metadata: results.length >= 24 ? { page: page + 1 } : undefined })
    }

    override getMangaShareUrl(mangaId: string): string { return `${BASE_URL}/title/${mangaId}` }
}
