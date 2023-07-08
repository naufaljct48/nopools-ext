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

import {
    createHomeSection,
    DefaultHomeSectionData
} from '../MangaStreamHelper'

import { KomikcastParser } from './KomikcastParser'

const DOMAIN = 'https://komikcast.io'

export const KomikcastInfo: SourceInfo = {
    version: getExportVersion('0.0.3'),
    name: 'Komikcast',
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

export class Komikcast extends MangaStream {

    baseUrl: string = DOMAIN

    override directoryPath = 'komik'

    override parser = new KomikcastParser()

    override configureSections() {
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_alltime'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false

        //@ts-ignore
        this.homescreen_sections['popular_today'] = {
            ...DefaultHomeSectionData,
            section: createHomeSection('popular_today', 'Hot Komik Update', true),
            selectorFunc: ($: CheerioStatic) => $('div.swiper-slide', $('h3:contains(Hot Komik Update)')?.parent()?.next()),
            titleSelectorFunc: ($: CheerioStatic) => $('div.title'),
            subtitleSelectorFunc: ($: CheerioStatic, element: CheerioElement) => $('div.chapter', element).text().trim(),
            getViewMoreItemsFunc: (page: string) => `daftar-komik/page/${page}/?orderby=popular`,
            sortIndex: 10
        }
        this.homescreen_sections['latest_update'] = {
            ...DefaultHomeSectionData,
            section: createHomeSection('latest_update', 'Rilisan Terbaru', true),
            selectorFunc: ($: CheerioStatic) => $('div.utao', $('h3:contains(Rilisan Terbaru)')?.parent()?.next()),
            subtitleSelectorFunc: ($: CheerioStatic) => $('.listupd .utao .uta .luf > ul > li > a').first().text().trim(),
            getViewMoreItemsFunc: (page: string) => `daftar-komik/page/${page}/?orderby=update`,
            sortIndex: 20
        }
    }
}