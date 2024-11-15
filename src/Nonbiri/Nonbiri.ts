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

const DOMAIN = 'https://comic21.me'

export const NonbiriInfo: SourceInfo = {
    version: getExportVersion('0.0.2'),
    name: 'Nonbiri',
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: 'NaufalJCT48',
    authorWebsite: 'http://github.com/NaufalJCT48',
    icon: 'icon.png',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
    sourceTags: [
    {
        text: "Indonesia",
        type: BadgeColor.GREY
    },
    ]
}

export class Nonbiri extends MangaStream {

    baseUrl: string = DOMAIN

    override configureSections(): void {
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
        this.homescreen_sections['popular_today'].selectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.bsx', $('h2:contains(Terpopuler Hari Ini)')?.parent()?.next())
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.bsx', $('h2:contains(Rilisan Terbaru)')?.parent()?.next())
    }
}
