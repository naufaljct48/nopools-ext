import {
    BadgeColor,
    ContentRating,
    SourceInfo,
    SourceIntents
} from '@paperback/types'

import {
    getExportVersion,
    MangaStream
} from '../MangaStream'

import {
    getFilterTagsBySection,
    getIncludedTagBySection
} from '../MangaStreamHelper'

import { KomikcastParser } from './KomikcastParser'
import { URLBuilder } from '../UrlBuilder'

const DOMAIN = 'https://komikcast.vip'

export const KomikcastInfo: SourceInfo = {
    version: getExportVersion('0.0.0'),
    name: 'Komikcast',
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: 'NaufalJCT48',
    authorWebsite: 'http://github.com/NaufalJCT48',
    icon: 'icon.png',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
    sourceTags: [
        {
            text: "Indonesia",
            type: BadgeColor.GREY
        },
    ]
}

export class Komikcast extends MangaStream {

    baseUrl: string = DOMAIN

    override directoryPath = 'komik'

    override parser = new KomikcastParser()

    override configureSections() {
        this.homescreen_sections['popular_today'].selectorFunc = ($: CheerioStatic) => $('div.swiper-slide', $('h3:contains(Hot Komik Update)')?.parent()?.next())
        this.homescreen_sections['popular_today'].titleSelectorFunc = ($: CheerioStatic) => $('div.title').text().trim()
        this.homescreen_sections['popular_today'].subtitleSelectorFunc = ($: CheerioStatic, element: CheerioElement) => $('div.chapter', element).text().trim()
        this.homescreen_sections['popular_today'].getViewMoreItemsFunc = (page: string) => `daftar-komik/page/${page}/?orderby=popular`
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioStatic) => $('div.utao', $('span:contains(Rilisan Terbaru)')?.parent()?.next())
        this.homescreen_sections['latest_update'].titleSelectorFunc = ($: CheerioStatic) => $('h3').text().trim()
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioStatic, element: CheerioElement) => $('div.chapter', element).text().trim()
        this.homescreen_sections['latest_update'].getViewMoreItemsFunc = (page: string) => `daftar-komik/page/${page}/?sortby=update`
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false

    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // Request the manga page
        const request = App.createRequest({
            url: url: await this.getUsePostIds() ? `${this.baseUrl}/?p=${mangaId}/` : `${this.baseUrl}/${this.directoryPath}/${mangaId}/`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = this.cheerio.load(response.data as string)

        const chapter = $('li', 'div.komik_info-chapters')
        if (!chapter) {
            throw new Error(`Unable to fetch a chapter for chapter numer: ${chapterId}`)
        }

        // Fetch the ID (URL) of the chapter
        const id = $('a', chapter).attr('href') ?? ''
        if (!id) {
            throw new Error(`Unable to fetch id for chapter numer: ${chapterId}`)
        }
        // Request the chapter page
        const _request = App.createRequest({
            url: id,
            method: 'GET'
        })

        const _response = await this.requestManager.schedule(_request, 1)
        this.checkResponseError(_response)
        const _$ = this.cheerio.load(_response.data as string)

        return this.parser.parseChapterDetails(_$, mangaId, chapterId)
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const request = App.createRequest({
            url: `${this.baseUrl}/`,
            method: 'GET',
            param: `${this.directoryPath}/`
        })

        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = this.cheerio.load(response.data as string)

        return this.parser.parseTags($)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
    
        const request = await this.constructSearchRequest(page, query)
        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = this.cheerio.load(response.data as string)
        const results = await this.parser.parseSearchResults($, this)
    
        const manga: PartialSourceManga[] = []
        for (const result of results) {
            let mangaId: string = result.slug
            if (await this.getUsePostIds()) {
                mangaId = await this.slugToPostId(result.slug, result.path)
            }
    
            manga.push(App.createPartialSourceManga({
                mangaId,
                image: result.image,
                title: result.title,
                subtitle: result.subtitle
            }))
        }
    
        metadata = !this.parser.isLastPage($, 'view_more') ? { page: page + 1 } : undefined
        return App.createPagedResults({
            results: manga,
            metadata
        })
    }
    
    override async constructSearchRequest(page: number, query: SearchRequest): Promise<Request> {
        let urlBuilder: URLBuilder = new URLBuilder(this.baseUrl)
            .addPathComponent(this.directoryPath)
            .addQueryParameter('page', page.toString())
    
        if (query?.title) {
            urlBuilder = urlBuilder.addQueryParameter('s', encodeURIComponent(query?.title.replace(/[’–][a-z]*/g, '') ?? ''))
        } else {
            urlBuilder = urlBuilder
                .addQueryParameter('genre', getFilterTagsBySection('genres', query?.includedTags, true))
                .addQueryParameter('genre', getFilterTagsBySection('genres', query?.excludedTags, false, await this.supportsTagExclusion()))
                .addQueryParameter('status', getIncludedTagBySection('status', query?.includedTags))
                .addQueryParameter('type', getIncludedTagBySection('type', query?.includedTags))
                .addQueryParameter('order', getIncludedTagBySection('order', query?.includedTags))
        }
    
        const requestObject: RequestObject = {
            url: urlBuilder.buildUrl({ addTrailingSlash: true, includeUndefinedParameters: false }),
            method: 'GET'
        }
    
        return createRequestObject(requestObject);
    }
    
    
    
}