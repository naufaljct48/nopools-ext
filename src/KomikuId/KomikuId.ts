import {
    BadgeColor,
    ContentRating,
    SourceInfo,
    SourceIntents,
    ChapterDetails,
    PagedResults,
    PartialSourceManga,
    SearchRequest,
    Request,
    TagSection,
} from '@paperback/types'
import {
    load as cheerioLoad,
    CheerioAPI,
} from 'cheerio'
import { getExportVersion } from '../MangaStream'
import { KomikuIdParser } from './KomikuIdParser'

const DOMAIN = 'https://komiku.id'

export const KomikuIdInfo: SourceInfo = {
    version: getExportVersion('0.0.1'),
    name: 'Komiku.id',
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

export class KomikuId extends Source {
    baseUrl: string = DOMAIN
    parser = new KomikuIdParser()

    override configureSections(): void {
        // Configure latest updates section
        this.homescreen_sections['latest_update'].enabled = true
        this.homescreen_sections['latest_update'].selectorFunc = ($: CheerioAPI) => $('.bge')
        this.homescreen_sections['latest_update'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.kan h3', element).text().trim()
        this.homescreen_sections['latest_update'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => {
            const latestChap = $('div.new1:last-child span:last-child', element).text().trim()
            return latestChap
        }
        this.homescreen_sections['latest_update'].getViewMoreItemsFunc = (page: string) => 
            `pustaka/?orderby=modified&category_name=&genre=&genre2=&status=&page=${page}`

        // Configure top all time section
        this.homescreen_sections['top_alltime'].enabled = true
        this.homescreen_sections['top_alltime'].selectorFunc = ($: CheerioAPI) => $('.bge')
        this.homescreen_sections['top_alltime'].titleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => $('div.kan h3', element).text().trim()
        this.homescreen_sections['top_alltime'].subtitleSelectorFunc = ($: CheerioAPI, element: BasicAcceptedElems<AnyNode>) => {
            const latestChap = $('div.new1:last-child span:last-child', element).text().trim()
            return latestChap
        }
        this.homescreen_sections['top_alltime'].getViewMoreItemsFunc = (page: string) => 
            `pustaka/?orderby=meta_value_num&category_name=&genre=&genre2=&status=&page=${page}`

        // Disable unused sections
        this.homescreen_sections['popular_today'].enabled = false
        this.homescreen_sections['new_titles'].enabled = false
        this.homescreen_sections['top_monthly'].enabled = false
        this.homescreen_sections['top_weekly'].enabled = false
    }

    override async getSearchTags(): Promise<TagSection[]> {
        const request = App.createRequest({
            url: `${this.baseUrl}/`,
            method: 'GET'
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerioLoad(response.data as string)
        return this.parser.parseTags($)
    }

    // Add parseViewMore method to handle pagination
    override async parseViewMore($: CheerioAPI): Promise<PartialSourceManga[]> {
        const manga: PartialSourceManga[] = []
        
        for (const item of $('.bge').toArray()) {
            const title = $('div.kan h3', item).text().trim()
            const image = $('div.bgei img', item).attr('src') ?? ''
            const id = this.parser.idCleaner($('div.bgei a', item).attr('href') ?? '')
            const subtitle = $('div.new1:last-child span:last-child', item).text().trim()
            
            if (!id || !title) continue
            
            manga.push(App.createPartialSourceManga({
                id,
                image,
                title,
                subtitle
            }))
        }
        
        return manga
    }
    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1
        let request: Request
    
        if (query.title) {
            // Title search uses different endpoint
            request = App.createRequest({
                url: `${this.baseUrl}/?post_type=manga&s=${encodeURIComponent(query.title)}`,
                method: 'GET'
            })
        } else {
            // Filter search uses API endpoint for pagination
            const params = new URLSearchParams({
                orderby: getIncludedTagBySection('Order by', query?.includedTags) ?? 'modified',
                category_name: getIncludedTagBySection('Types', query?.includedTags) ?? '',
                genre: getIncludedTagBySection('Genres', query?.includedTags) ?? '',
                genre2: '',
                status: getIncludedTagBySection('Status', query?.includedTags) ?? ''
            })
    
            request = App.createRequest({
                url: page === 1 
                    ? `${this.baseUrl}/pustaka/?${params.toString()}`
                    : `https://api.komiku.id/manga/page/${page}/?${params.toString()}`,
                method: 'GET'
            })
        }
    
        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerioLoad(response.data as string)
    
        const manga: PartialSourceManga[] = []
        for (const item of $('.bge').toArray()) {
            const title = $('div.kan h3', item).text().trim()
            const image = $('div.bgei img', item).attr('src') ?? ''
            const id = this.parser.idCleaner($('div.bgei a', item).attr('href') ?? '')
            const subtitle = $('div.new1:last-child span:last-child', item).text().trim()
            
            if (!id || !title) continue
            
            manga.push(App.createPartialSourceManga({
                id,
                image,
                title,
                subtitle
            }))
        }
    
        // Always return next page metadata since the site uses infinite scroll
        return App.createPagedResults({
            results: manga,
            metadata: manga.length > 0 ? { page: page + 1 } : undefined
        })
    }
}