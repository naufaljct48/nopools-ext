import {
    BadgeColor,
    ContentRating,
    HomeSectionType,
    SourceInfo,
    SourceIntents
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

const DOMAIN = 'https://kanzenin.info'

export const KanzeninInfo: SourceInfo = {
    version: getExportVersion('0.0.9'),
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

    override homepageListingUrl = `${DOMAIN}/manga/?page=1&order=update`

    override homepageSections = [
        { url: `${DOMAIN}/manga/?page=1&status=&type=&order=update`, sectionKey: 'latest_update' as const },
        { url: `${DOMAIN}/manga/?order=popular`, sectionKey: 'popular_today' as const }
    ]

    override configureSections(): void {
        this.homescreen_sections['popular_today'].section = createHomeSection('popular_today', 'Featured', true, HomeSectionType.featured)
        this.homescreen_sections['popular_today'].selectorFunc = ($: CheerioAPI) => $('div.bs', 'div.listupd')
        this.homescreen_sections['popular_today'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('a', element).first().attr('title')
        this.homescreen_sections['popular_today'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.epxs', element).first().text().trim()
        this.homescreen_sections['popular_today'].getViewMoreItemsFunc = (page: string) => `manga/page/${page}/?status=&type=&order=popular`
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioAPI) => $('div.bs', 'div.listupd')
        this.homescreen_sections['latest_update'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('a', element).first().attr('title')
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.epxs', element).first().text().trim()
        this.homescreen_sections['latest_update'].getViewMoreItemsFunc = (page: string) => `manga/page/${page}/?order=update`
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
