import {
    BadgeColor,
    ContentRating,
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

const DOMAIN = 'https://komikindo.fit'

export const KomikIndoTopInfo: SourceInfo = {
    version: getExportVersion('0.0.3'),
    name: 'KomikIndoTop',
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

export class KomikIndoTop extends MangaStream {

    baseUrl: string = DOMAIN

    override manga_tag_selector_box = 'div.seriestugenre'

    override configureSections(): void {
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
        this.homescreen_sections['project'].enabled = true
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.bsx', $('h2:contains(Latest Update)')?.parent()?.next())
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('span.fivchap', element).first().text().trim()
    }
}