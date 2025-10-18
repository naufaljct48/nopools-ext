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
import { WestMangaParser } from './WestMangaParser'
import {
    DefaultWestMangaHomeSectionData,
    WestMangaHomeSectionData,
    createWestMangaHomeSection
} from './WestMangaHelper'

const DOMAIN = 'https://westmanga.me'

export const WestMangaInfo: SourceInfo = {
    version: getExportVersion('0.0.3'),
    name: 'WestManga',
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

export class WestManga extends MangaStream {

    baseUrl: string = DOMAIN
    
    // Override the parser to use WestMangaParser
    override parser = new WestMangaParser()

    override manga_tag_selector_box = 'div.flex.flex-wrap.gap-1' // Updated selector for WestManga

    override configureSections(): void {
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
        
        // Update selectors for WestManga's HTML structure
        this.homescreen_sections['popular_today'].selectorFunc = ($: CheerioAPI) => {
            // Find the tablist and then the active tab content
            const tablist = $('div[role="tablist"]')
            const activeTab = tablist.find('button[aria-selected="true"]')
            
            if (activeTab.text().includes('Sepanjang Waktu')) {
                // Get the manga grid for "Sepanjang Waktu" (All Time) tab
                return $('div.grid.grid-cols-3 > div.overflow-hidden')
            } else {
                // Default to the first grid if we can't find the right tab
                return $('div.grid.grid-cols-3 > div.overflow-hidden').first()
            }
        }
        
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioAPI) => {
            // Find the latest update section
            return $('div.grid.grid-cols-3.sm\\:grid-cols-3.md\\:grid-cols-3.lg\\:grid-cols-5 > div.overflow-hidden')
        }
        
        // Update title and subtitle selectors for WestManga's structure
        this.homescreen_sections['popular_today'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => {
            return $('a p.font-medium', element).text().trim()
        }
        
        this.homescreen_sections['popular_today'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => {
            return $('div[data-slot="card-content"] p.text-xs span:first-child', element).text().trim()
        }
        
        this.homescreen_sections['latest_update'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => {
            return $('a p.font-medium', element).text().trim()
        }
        
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => {
            return $('div[data-slot="card-content"] p.text-xs span:first-child', element).text().trim()
        }
    }
    
    // Override the directory path for WestManga
    override directoryPath = 'comic'
    
    // Override the manga details selectors for WestManga
    override manga_selector_AlternativeTitles = 'Alternative Titles'
    override manga_selector_author = 'Author'
    override manga_selector_artist = 'Artist'
    override manga_selector_status = 'Status'
}