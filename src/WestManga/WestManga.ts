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
    version: getExportVersion('0.0.4'),
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

    // WestManga tidak menggunakan postId (bukan WordPress), pakai slug saja
    override usePostIds = false

    // Tag box di halaman detail
    override manga_tag_selector_box = 'div.flex.flex-wrap.gap-1'

    override configureSections(): void {
        // Nonaktifkan section yang tidak tersedia
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
        
        // Popular Today: kartu vertikal berisi cover + judul + info chapter
        this.homescreen_sections['popular_today'].selectorFunc = ($: CheerioAPI) => {
            // Ambil elemen kartu komik (overflow-hidden) yang memiliki link ke /comic/
            return $('div.overflow-hidden').filter((_, el) => Boolean($('a[href^="/comic/"]', el).length))
        }
        this.homescreen_sections['popular_today'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => {
            return $('a p.font-medium', element).text().trim()
        }
        this.homescreen_sections['popular_today'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => {
            return $('div[data-slot="card"] p.text-xs', element).first().text().trim()
        }

        // Latest Update: grid 3/5 kolom berisi kartu komik
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioAPI) => {
            return $('div.grid.grid-cols-3, div.grid.lg\\:grid-cols-5').find('> div.overflow-hidden')
        }
        this.homescreen_sections['latest_update'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => {
            return $('a p.font-medium', element).text().trim()
        }
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => {
            return $('div[data-slot="card"] p.text-xs', element).first().text().trim()
        }
        // Hindari request ke /comic/?..., gunakan halaman contents untuk View More
        this.homescreen_sections['latest_update'].getViewMoreItemsFunc = (page: string) => `contents?page=${page}`
    }
    
    // Path detail manga memakai /comic/:slug
    override directoryPath = 'comic'
    
    // Override selector label metadata (untuk fallback saja)
    override manga_selector_AlternativeTitles = 'Alternative Titles'
    override manga_selector_author = 'Author'
    override manga_selector_artist = 'Artist'
    override manga_selector_status = 'Status'

    // Hindari pemanggilan /comic/ untuk pengambilan tag pencarian
    async getSearchTags() {
        // WestManga tidak menyediakan dropdown tags konvensional; kembalikan kosong agar Discover tidak error
        return []
    }

    // Gunakan endpoint "contents" untuk pencarian / listing
    async constructSearchRequest(page: number, query: any): Promise<any> {
        const base = `${this.baseUrl}/contents`
        const params: Record<string, string> = { page: String(page) }
        if (query?.title) {
            params['s'] = encodeURIComponent(query.title)
        }
        // Bangun URL
        const qs = Object.entries(params).map(([k,v]) => `${k}=${v}`).join('&')
        return App.createRequest({ url: `${base}?${qs}`, method: 'GET' })
    }

    // ChapterId yang dikirim adalah path /view/...; langsung request halaman chapter
    async getChapterDetails(mangaId: string, chapterId: string) {
        const isAbsolute = chapterId.startsWith('http://') || chapterId.startsWith('https://')
        const url = isAbsolute ? chapterId : `${this.baseUrl}${chapterId.startsWith('/') ? '' : '/'}${chapterId}`
        const request = App.createRequest({ url, method: 'GET' })
        const response = await this.requestManager.schedule(request, 1)
        this.checkResponseError(response)
        const $ = require('cheerio').load(response.data as string)
        return this.parser.parseChapterDetails($, mangaId, chapterId)
    }
}