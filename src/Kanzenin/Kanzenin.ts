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
import {
    getCloudflareBypassUrlKanzenin,
    getHomePageSectionsKanzenin,
    getSearchTagsKanzenin,
    getViewMoreItemsKanzenin
} from './KanzeninHelper'

const DOMAIN = 'https://kanzenin.info'

export const KanzeninInfo: SourceInfo = {
    version: getExportVersion('0.1.3'),
    name: 'Kanzenin',
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: 'NaufalJCT48',
    authorWebsite: 'http://github.com/NaufalJCT48',
    icon: 'icon.png',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
    sourceTags: [
        {
            text: 'Indonesia',
            type: BadgeColor.GREY
        },
        {
            text: '18+',
            type: BadgeColor.RED
        }
    ]
}

export class Kanzenin extends MangaStream {

    baseUrl: string = DOMAIN

    override configureSections(): void {
        this.homescreen_sections['popular_today'].section = createHomeSection('popular_today', 'Featured', true, HomeSectionType.featured)
        this.homescreen_sections['popular_today'].selectorFunc = ($: CheerioAPI) => $('div.bs', 'div.listupd')
        this.homescreen_sections['popular_today'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('a', element).first().attr('title')
        this.homescreen_sections['popular_today'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.epxs', element).first().text().trim()
        this.homescreen_sections['popular_today'].getViewMoreItemsFunc = (page: string) => `manga/?page=${page}&status=&type=&order=popular`
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
        this.homescreen_sections['project'].enabled = true
        this.homescreen_sections['project'].selectorFunc = ($: CheerioAPI) => $('div.bsx')
        this.homescreen_sections['project'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('a', element).first().attr('title')
        this.homescreen_sections['project'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.epxs', element).first().text().trim()
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioAPI) => $('div.bs', 'div.listupd')
        this.homescreen_sections['latest_update'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('a', element).first().attr('title')
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.epxs', element).first().text().trim()
        this.homescreen_sections['latest_update'].getViewMoreItemsFunc = (page: string) => `manga/?page=${page}&order=update`
    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        return getHomePageSectionsKanzenin(this, sectionCallback)
    }

    override async getHomePageSection(sectionCallback: (section: HomeSection) => void): Promise<void> {
        return this.getHomePageSections(sectionCallback)
    }

    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        return getViewMoreItemsKanzenin(this, homepageSectionId, metadata)
    }

    override async getSearchTags(): Promise<TagSection[]> {
        return getSearchTagsKanzenin(this)
    }

    override async getCloudflareBypassRequestAsync(): Promise<Request> {
        return App.createRequest({
            url: getCloudflareBypassUrlKanzenin(this.baseUrl),
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
            url: getCloudflareBypassUrlKanzenin(this.baseUrl),
            method: 'GET',
            headers: {
                'referer': `${this.baseUrl}/`,
                'origin': `${this.baseUrl}/`
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
