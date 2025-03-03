import {
    BadgeColor,
    ContentRating,
    SourceInfo,
    SourceIntents,
    ChapterDetails,
    PagedResults,
    PartialSourceManga,
    SearchRequest,
    Request,
    TagSection,
    LanguageCode  // Add this import
} from '@paperback/types'
import {
    BasicAcceptedElems,
    CheerioAPI,
    load as cheerioLoad // Add this import
} from 'cheerio'
import { AnyNode } from 'domhandler'

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

const DOMAIN = 'https://komikcast02.com'

export const KomikcastInfo: SourceInfo = {
    version: getExportVersion('0.1.0'),
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
    override usePostIds = false
    override parser = new KomikcastParser()
    override language = LanguageCode.INDONESIAN  // Add this override

    override configureSections() {
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.utao')
        this.homescreen_sections['latest_update'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.luf h3', element).text().trim()
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.luf ul li:first-child a', element).text().trim()
        this.homescreen_sections['latest_update'].getViewMoreItemsFunc = (page: string) => `komik/page/${page}/?sortby=update`
    
        // Enable and configure popular today section
        this.homescreen_sections['popular_today'].enabled = true
        this.homescreen_sections['popular_today'].selectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('.swiper-slide')
        this.homescreen_sections['popular_today'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.title', element).text().trim()
        this.homescreen_sections['popular_today'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.chapter', element).text().trim()
        this.homescreen_sections['popular_today'].getViewMoreItemsFunc = (page: string) => `komik/page/${page}/?order=popular`
    
        // Disable other unused sections
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
    }

    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const request = App.createRequest({
            url: await this.getUsePostIds()
                ? `${this.baseUrl}/?p=${mangaId}/`
                : `${this.baseUrl}/${this.directoryPath}/${mangaId}/`,
            method: 'GET'
        });
    
        const response = await this.requestManager.schedule(request, 1);
        this.checkResponseError(response);
    
        const $: CheerioAPI = cheerio.load(response.data as string);
        const chapterElement = $('li', 'div.komik_info-chapters').filter((_, el) => {
            return $('a', el).attr('href')?.includes(chapterId);
        });
    
        if (!chapterElement.length) {
            throw new Error(`Unable to fetch chapter: ${chapterId}`);
        }
    
        const id = $('a', chapterElement).attr('href') ?? '';
        if (!id) {
            throw new Error(`Unable to fetch id for chapter: ${chapterId}`);
        }
    
        const _request = App.createRequest({
            url: id,
            method: 'GET'
        });
    
        const _response = await this.requestManager.schedule(_request, 1);
        this.checkResponseError(_response);
    
        const _$: CheerioAPI = cheerio.load(_response.data as string);
        return this.parser.parseChapterDetails(_$, mangaId, chapterId);
    }    

    override async getSearchTags(): Promise<TagSection[]> {
        const request = App.createRequest({
            url: `${this.baseUrl}/`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)

        return this.parser.parseTags($)
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
    
        const request = await this.constructSearchRequest(page, query)
        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)
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
    
        return App.createRequest({
            url: urlBuilder.buildUrl({ addTrailingSlash: true, includeUndefinedParameters: false }),
            method: 'GET'
        })
    }
    convertTime(time: string): Date {
        if (time.includes('ago') || time.includes('yang lalu')) {
            const number = Number(time.replace(/[^0-9]/g, ''))
            const date = new Date()
            
            if (time.includes('minutes') || time.includes('menit')) {
                date.setMinutes(date.getMinutes() - number)
            } else if (time.includes('hours') || time.includes('jam')) {
                date.setHours(date.getHours() - number)
            } else if (time.includes('days') || time.includes('hari')) {
                date.setDate(date.getDate() - number)
            } else if (time.includes('weeks') || time.includes('minggu')) {
                date.setDate(date.getDate() - (number * 7))
            } else if (time.includes('months') || time.includes('bulan')) {
                date.setMonth(date.getMonth() - number)
            } else if (time.includes('years') || time.includes('tahun')) {
                date.setFullYear(date.getFullYear() - number)
            }
    
            return date
        }
    
        return new Date(time)
    }
}
