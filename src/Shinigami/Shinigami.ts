import {
    BadgeColor,
    ContentRating,
    SourceInfo,
    SourceIntents
} from '@paperback/types'
import { MangaStream } from '../MangaStream'
import { ShinigamiParser } from './ShinigamiParser'
import { getExportVersion } from '../MangaStream'

const DOMAIN = 'https://app.shinigami.asia'
const API_DOMAIN = 'https://api.shngm.io'
const API_BASE_PATH = 'v1'

export const ShinigamiInfo: SourceInfo = {
    version: getExportVersion('0.0.2'),
    name: 'Shinigami',
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: 'NaufalJCT48',
    authorWebsite: 'http://github.com/NaufalJCT48',
    icon: 'icon.png',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: DOMAIN,
    intents: SourceIntents.MANGA_CHAPTERS | SourceIntents.HOMEPAGE_SECTIONS | SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
    sourceTags: [
        {
            text: "Indonesia",
            type: BadgeColor.GREY
        }
    ]
}

export class Shinigami extends MangaStream {
    baseUrl = DOMAIN
    parser = new ShinigamiParser()

    override async getRequest(url: string, method: string = 'GET', param?: string) {
        const request = App.createRequest({
            url: url + (param ?? ''),
            method,
            headers: {
                'Accept': 'application/json',
                'DNT': '1',
                'Origin': DOMAIN,
                'Sec-GPC': '1'
            }
        })
        
        const response = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(response.data as string)
        return $
    }

    override configureSections(): void {
        this.homescreen_sections.popular_today.section = App.createHomeSection({
            id: 'popular',
            title: 'Popular',
            containsMoreItems: true
        })
        this.homescreen_sections.popular_today.getViewMoreItemsFunc = (page: string) => 
            `${API_DOMAIN}/${API_BASE_PATH}/manga/list?page=${page}&page_size=30&sort=popularity`

        this.homescreen_sections.latest_update.section = App.createHomeSection({
            id: 'latest',
            title: 'Latest Updates',
            containsMoreItems: true
        })
        this.homescreen_sections.latest_update.getViewMoreItemsFunc = (page: string) => 
            `${API_DOMAIN}/${API_BASE_PATH}/manga/list?page=${page}&page_size=30&sort=latest`

        // Disable unused sections
        this.homescreen_sections.new_titles.enabled = false
        this.homescreen_sections.top_alltime.enabled = false
        this.homescreen_sections.top_monthly.enabled = false
        this.homescreen_sections.top_weekly.enabled = false
    }
}