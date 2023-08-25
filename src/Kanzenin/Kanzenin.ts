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

const DOMAIN = 'https://kanzenin.info'

export const KanzeninInfo: SourceInfo = {
    version: getExportVersion('0.0.2'),
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
        text: "Indonesia",
        type: BadgeColor.GREY
    },
    {
        text: "18+",
        type: BadgeColor.RED
    }
    ]
}

export class Kanzenin extends MangaStream {

    baseUrl: string = DOMAIN

    override configureSections(): void {
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioStatic) => $('div.utao', $('h2:contains(Latest Update)')?.parent()?.next())
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