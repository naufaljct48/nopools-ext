import {
    BadgeColor,
    ContentRating,
    SourceInfo,
    SourceIntents
} from '@paperback/types'
import * as cheerio from 'cheerio'
import { AnyNode } from 'domhandler'

import {
    getExportVersion,
    MangaStream
} from '../MangaStream'

const DOMAIN = 'https://komiktap.info'

export const KomikTapInfo: SourceInfo = {
    version: getExportVersion('3.0.3'),
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
            text: 'Indonesia',
            type: BadgeColor.GREY
        },
        {
            text: '18+',
            type: BadgeColor.RED
        }
    ]
}

export class KomikTap extends MangaStream {

    baseUrl: string = DOMAIN

    override manga_tag_selector_box = 'div.seriestugenre'

    override homepageListingUrl = `${DOMAIN}/manga/?page=1&order=update`

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
