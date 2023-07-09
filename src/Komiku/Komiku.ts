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

const DOMAIN = 'https://komiku.com'

export const KomikuInfo: SourceInfo = {
    version: getExportVersion('0.0.4'),
    name: 'Komiku',
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

export class Komiku extends MangaStream {

    baseUrl: string = DOMAIN

    override configureSections(): void {
        this.homescreen_sections['new_titles'].enabled = true
        this.homescreen_sections['new_titles'].selectorFunc = ($: CheerioStatic) => $('li', $('h3:contains(Baca Komik Serial Terbaru)')?.parent()?.next())
        this.homescreen_sections['popular_today'].selectorFunc = ($: CheerioStatic) => $('div.bsx', $('h2:contains(Baca Komik Terpopuler Hari Ini Online)')?.parent()?.next())
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioStatic) => $('div.uta', $('h2:contains(Baca Komik Terbaru Online)')?.parent()?.next())
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
    }
    override dateMonths = {
        january: 'Januari',
        february: 'Februari',
        march: 'Maret',
        april: 'April',
        may: 'Mei',
        june: 'Juni',
        july: 'Juli',
        august: 'Agustus',
        september: 'September',
        october: 'Oktober',
        november: 'November',
        december: 'Desember'
    }
}