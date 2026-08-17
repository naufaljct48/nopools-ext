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

const DOMAIN = 'https://manhwalist02.asia'

export const ManhwalistInfo: SourceInfo = {
    version: getExportVersion('0.0.0'),
    name: 'Manhwalist',
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: 'NaufalJCT48',
    authorWebsite: 'http://github.com/NaufalJCT48',
    icon: 'icon.png',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED | SourceIntents.SETTINGS_UI,
    sourceTags: [
        {
            text: 'Indonesia',
            type: BadgeColor.GREY
        }
    ]
}

export class Manhwalist extends MangaStream {

    baseUrl: string = DOMAIN

    // Themesia "mangareader" theme: default `manga` directory, `span.mgen` tag box and
    // English month names all match the base class, so only sections need wiring.
    override configureSections(): void {
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false

        this.homescreen_sections['project'].enabled = true
        // Project Update renders utao/uta cards, not the bsx cards the base assumes
        this.homescreen_sections['project'].selectorFunc = ($: CheerioAPI) => $('div.uta', $('h2:contains(Project Update)')?.parent()?.next())
        this.homescreen_sections['project'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('a', element).first().attr('title')
        this.homescreen_sections['project'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.epxs', element).first().text().trim()
        // Listing pages honour `?page=N`; path-style /manga/page/N/ is ignored by this theme
        this.homescreen_sections['project'].getViewMoreItemsFunc = (page: string) => `manga/?page=${page}&status=&type=&order=update`

        this.homescreen_sections['popular_today'].getViewMoreItemsFunc = (page: string) => `manga/?page=${page}&status=&type=&order=popular`
        this.homescreen_sections['latest_update'].getViewMoreItemsFunc = (page: string) => `manga/?page=${page}&status=&type=&order=update`
    }
}
