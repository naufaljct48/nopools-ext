import {
    BadgeColor,
    ContentRating,
    HomeSection,
    PagedResults,
    Request,
    SourceInfo,
    SourceIntents,
    TagSection
} from '@paperback/types'
import * as cheerio from 'cheerio'
import { AnyNode } from 'domhandler'

import {
    getExportVersion,
    MangaStream
} from '../MangaStream'

const DOMAIN = 'https://komiktap.info'

export const KomikTapInfo: SourceInfo = {
    version: getExportVersion('3.0.0'),
    name: 'KomikTap',
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

export class KomikTap extends MangaStream {

    baseUrl: string = DOMAIN

    override manga_tag_selector_box = 'div.seriestugenre'

    override configureSections(): void {
        this.homescreen_sections['popular_today'].enabled = false
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
        this.homescreen_sections['latest_update'].selectorFunc = ($: cheerio.CheerioAPI) => $('div.bs', 'div.listupd')
        this.homescreen_sections['latest_update'].titleSelectorFunc = ($: cheerio.CheerioAPI, element: cheerio.BasicAcceptedElems<AnyNode>) => $('a', element).first().attr('title')
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: cheerio.CheerioAPI, element: cheerio.BasicAcceptedElems<AnyNode>) => $('div.epxs', element).first().text().trim()
        this.homescreen_sections['latest_update'].getViewMoreItemsFunc = (page: string) => `manga/page/${page}/?order=update`
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const request = App.createRequest({
            url: `${this.baseUrl}/manga/?page=1&order=update`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)
        const section = this.homescreen_sections['latest_update']

        sectionCallback(section.section)
        section.section.items = await this.parser.parseHomeSection($, section, this)
        sectionCallback(section.section)
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        if (homepageSectionId !== 'latest_update') {
            return super.getViewMoreItems(homepageSectionId, metadata)
        }

        const page = metadata?.page ?? 2
        const request = App.createRequest({
            url: `${this.baseUrl}/manga/page/${page}/?order=update`,
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
            url: `${this.baseUrl}/manga/?page=1&order=update`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = cheerio.load(response.data as string)

        return this.parser.parseTags($)
    }

    override async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: `${this.baseUrl}/manga/?page=1&order=update`,
            method: 'GET',
            headers: {
                'referer': `${this.baseUrl}/`,
                'origin': `${this.baseUrl}/`,
                'user-agent': await this.requestManager.getDefaultUserAgent()
            }
        })
    }
    override dateMonths = {
        january: 'januari',
        february: 'februari',
        march: 'maret',
        april: 'april',
        may: 'mei',
        june: 'juni',
        july: 'juli',
        august: 'agustus',
        september: 'september',
        october: 'oktober',
        november: 'november',
        december: 'desember'
    }
}
