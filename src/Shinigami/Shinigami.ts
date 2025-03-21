import {
    Source,
    Manga,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    HomeSectionType,
    SourceInfo,
    ContentRating,
    BadgeColor,
    SourceIntents
} from '@paperback/types'
import { createRequestObject } from './ShinigamiHelper'
import { parseMangaDetails, parseChapterList, parseChapterDetails, parseMangaList } from './ShinigamiParser'

const API_URL = 'https://api.shngm.io'
const CDN_URL = 'https://storage.shngm.id'
const BASE_URL = 'https://app.shinigami.asia'

export const ShinigamiInfo: SourceInfo = {
    version: '1.0.4',
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
        requestTimeout: 15000
    })

    async getMangaDetails(mangaId: string): Promise<Manga> {
        const request = createRequestObject({
            url: `${API_URL}/v1/manga/detail/${mangaId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data)

        if (data.retcode !== 0) {
            throw new Error('Failed to get manga details')
        }

        return parseMangaDetails(data, mangaId)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const request = createRequestObject({
            url: `${API_URL}/v1/chapter/${mangaId}/list`,
            param: '?page=1&page_size=3000&sort_by=chapter_number&sort_order=desc',
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data)

        if (data.retcode !== 0) return []

        return parseChapterList(data, mangaId)
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = createRequestObject({
            url: `${API_URL}/v1/chapter/detail/${chapterId}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const data = JSON.parse(response.data)

        if (data.retcode !== 0) {
            throw new Error('Failed to get chapter details')
        }

        return parseChapterDetails(data, mangaId, chapterId)
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: createRequestObject({
                    url: `${API_URL}/v1/manga/list?type=project&page=1&page_size=30&is_featured=true`,
                    method: 'GET'
                }),
                section: App.createHomeSection({
                    id: 'latest',
                    title: 'Latest Updates',
                    type: HomeSectionType.singleRowNormal,
                    view_more: true
                })
            },
            {
                request: createRequestObject({
                    url: `${API_URL}/v1/manga/list?format=manhwa&page=1&page_size=10&is_recommended=true`,
                    method: 'GET'
                }),                
                section: App.createHomeSection({
                    id: 'featured',
                    title: 'Featured Series',
                    type: HomeSectionType.featured,
                    view_more: true
                })
            }
        ]

        for (const section of sections) {
            sectionCallback(section.section)
            const response = await this.requestManager.schedule(section.request, 1)
            const data = JSON.parse(response.data)

            if (data.retcode !== 0) continue

            section.section.items = parseMangaList(data)
            sectionCallback(section.section)
        }
    }
}