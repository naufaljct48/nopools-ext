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

const DOMAIN = 'https://westmanga.info'

export const WestMangaInfo: SourceInfo = {
    version: getExportVersion('0.0.2'),
    name: 'WestManga',
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

export class WestManga extends MangaStream {

    baseUrl: string = DOMAIN

    override configureSections(): void {
        this.homescreen_sections['new_titles'].enabled = true
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
        this.homescreen_sections['new_titles'].selectorFunc = ($: CheerioStatic) => $('li', $('h3:contains(Project Baru WM)')?.parent()?.next())
        this.homescreen_sections['popular_today'].selectorFunc = ($: CheerioStatic) => $('div.bsx', $('h2:contains(Komik Popular Hari Ini...)')?.parent()?.next())
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioStatic) => $('div.bsx', $('h2:contains(UPDATE KOMIK LAINYA...)')?.parent()?.next())
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioStatic, element: CheerioElement) => $('div.epxs', element).text().trim()
    }
}