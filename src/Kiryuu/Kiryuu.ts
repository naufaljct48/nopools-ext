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

const DOMAIN = 'https://kiryuu.id'

export const KiryuuInfo: SourceInfo = {
    version: getExportVersion('0.0.0'),
    name: 'Kiryuu',
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: 'NaufalJCT48',
    authorWebsite: 'http://github.com/NaufalJCT48',
    icon: 'icon.png',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
    sourceTags: [
        { text: "Indonesia", color: BadgeColor.GREY },
    ]
}

export class Kiryuu extends MangaStream {

    baseUrl: string = DOMAIN

    override configureSections(): void {
        this.homescreen_sections['new_titles'].enabled = false
    }
}