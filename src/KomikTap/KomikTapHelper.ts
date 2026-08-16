import { Request } from '@paperback/types'
import * as cheerio from 'cheerio'
import { MangaStream } from '../MangaStream'
import { HomeSectionData } from '../MangaStreamHelper'

export const getHomePageSectionsKomikTap = async (
    source: MangaStream,
    sectionCallback: (section: any) => void
): Promise<void> => {
    const request = App.createRequest({
        url: `${source.baseUrl}/manga/?page=1&order=update`,
        method: 'GET'
    })

    const response = await source.requestManager.schedule(request, 1)
    source.checkResponseError(response)
    const $ = cheerio.load(response.data as string)
    const section = source.homescreen_sections['latest_update']

    sectionCallback(section.section)
    section.section.items = await source.parser.parseHomeSection($, section, source)
    sectionCallback(section.section)
}

export const getViewMoreItemsKomikTap = async (
    source: MangaStream,
    homepageSectionId: string,
    metadata: any
): Promise<any> => {
    if (homepageSectionId !== 'latest_update') {
        return undefined // fallback to base
    }

    const page = metadata?.page ?? 2
    // NOTE: path-style /manga/page/N/ is ignored by the server (always returns
    // page 1) -> infinite loop. ?page=N is the working pagination.
    const request = App.createRequest({
        url: `${source.baseUrl}/manga/?page=${page}&order=update`,
        method: 'GET'
    })

    const response = await source.requestManager.schedule(request, 1)
    source.checkResponseError(response)
    const $ = cheerio.load(response.data as string)

    const results = await source.parser.parseViewMore($, source)
    return App.createPagedResults({
        results,
        metadata: results.length > 0 && !source.parser.isLastPage($, 'view_more') ? { page: page + 1 } : undefined
    })
}

export const getSearchTagsKomikTap = async (source: MangaStream): Promise<any> => {
    const request = App.createRequest({
        url: `${source.baseUrl}/manga/?page=1&order=update`,
        method: 'GET'
    })

    const response = await source.requestManager.schedule(request, 1)
    source.checkResponseError(response)
    const $ = cheerio.load(response.data as string)

    return source.parser.parseTags($)
}

export const getCloudflareBypassUrlKomikTap = (baseUrl: string): string =>
    `${baseUrl}/manga/?page=1&order=update`
