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
import { Months } from '../MangaStreamInterfaces'

const DOMAIN = 'https://kanzenin.xyz'

export const KanzeninInfo: SourceInfo = {
    version: getExportVersion('0.0.0'),
    name: 'Kanzenin',
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
    }

    override dateMonths: Months = {
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