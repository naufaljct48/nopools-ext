import {
    BadgeColor,
    ContentRating,
    HomeSection,
    HomeSectionType,
    PagedResults,
    Request,
    SourceInfo,
    SourceIntents,
    TagSection
} from '@paperback/types'
import * as cheerio from 'cheerio'
import {
    BasicAcceptedElems,
    CheerioAPI
} from 'cheerio'
import { AnyNode } from 'domhandler'

import {
    getExportVersion,
    MangaStream
} from '../MangaStream'
import { createHomeSection } from '../MangaStreamHelper'

const DOMAIN = 'https://mangasusuku.com'

export const MangasusuInfo: SourceInfo = {
    version: getExportVersion('0.0.5'),
    name: 'Mangasusu',
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: 'NaufalJCT48',
    authorWebsite: 'http://github.com/NaufalJCT48',
    icon: 'icon.png',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
    sourceTags: [
    {
        text: "Indonesia",
        type: BadgeColor.GREY
    },
    {
        text: "18+",
        type: BadgeColor.RED
    }
    ]
}

export class Mangasusu extends MangaStream {

    baseUrl: string = DOMAIN

    override manga_tag_selector_box = 'div.seriestugenre'

    override directoryPath = 'komik'

    override configureSections(): void {
        this.homescreen_sections['popular_today'].section = createHomeSection('popular_today', 'Featured', true, HomeSectionType.featured)
        this.homescreen_sections['popular_today'].selectorFunc = ($: CheerioAPI) => $('div.bs', 'div.listupd')
        this.homescreen_sections['popular_today'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('a', element).first().attr('title')
        this.homescreen_sections['popular_today'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.epxs', element).first().text().trim()
        this.homescreen_sections['popular_today'].getViewMoreItemsFunc = (page: string) => `komik/page/${page}/?status=&type=&order=popular`
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioAPI) => $('div.bs', 'div.listupd')
        this.homescreen_sections['latest_update'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('a', element).first().attr('title')
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.epxs', element).first().text().trim()
        this.homescreen_sections['latest_update'].getViewMoreItemsFunc = (page: string) => `komik/page/${page}/?order=update`
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: App.createRequest({ url: `${this.baseUrl}/komik/?page=1&order=update`, method: 'GET' }),
                data: this.homescreen_sections['latest_update']
            },
            {
                request: App.createRequest({ url: `${this.baseUrl}/komik/?status=&type=&order=popular`, method: 'GET' }),
                data: this.homescreen_sections['popular_today']
            }
        ]

        for (const section of sections) {
            sectionCallback(section.data.section)
            const response = await this.requestManager.schedule(section.request, 1)
            this.checkResponseError(response)
            section.data.section.items = await this.parser.parseHomeSection(cheerio.load(response.data as string), section.data, this)
            sectionCallback(section.data.section)
        }
    }

    override async getHomePageSection(sectionCallback: (section: HomeSection) => void): Promise<void> {
        return this.getHomePageSections(sectionCallback)
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 2
        const path = homepageSectionId === 'popular_today'
            ? `komik/page/${page}/?status=&type=&order=popular`
            : `komik/page/${page}/?order=update`
        const request = App.createRequest({
            url: `${this.baseUrl}/${path}`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)

        return App.createPagedResults({
            results: await this.parser.parseViewMore($, this),
            metadata: !this.parser.isLastPage($, 'view_more') ? { page: page + 1 } : undefined
        })
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const request = App.createRequest({
            url: `${this.baseUrl}/komik/?page=1&order=update`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)

        return this.parser.parseTags($)
    }

    override async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: `${this.baseUrl}/komik/?page=1&order=update`,
            method: 'GET',
            headers: {
                'referer': `${this.baseUrl}/`,
                'origin': `${this.baseUrl}/`,
                'user-agent': await this.requestManager.getDefaultUserAgent()
            }
        })
    }

    override getCloudflareBypassRequest(): Request {
        return App.createRequest({
            url: `${this.baseUrl}/komik/?page=1&order=update`,
            method: 'GET',
            headers: {
                'referer': `${this.baseUrl}/`,
                'origin': `${this.baseUrl}/`
            }
        })
    }
}
