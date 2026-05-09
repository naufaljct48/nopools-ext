import * as cheerio from 'cheerio'
import { MangaStream } from '../MangaStream'

export const getHomePageSectionsMangasusu = async (
    source: MangaStream,
    sectionCallback: (section: any) => void
): Promise<void> => {
    const sections = [
        {
            request: App.createRequest({ url: `${source.baseUrl}/komik/?page=1&order=update`, method: 'GET' }),
            data: source.homescreen_sections['latest_update']
        },
        {
            request: App.createRequest({ url: `${source.baseUrl}/komik/?status=&type=&order=popular`, method: 'GET' }),
            data: source.homescreen_sections['popular_today']
        }
    ]

    for (const section of sections) {
        sectionCallback(section.data.section)
        const response = await source.requestManager.schedule(section.request, 1)
        source.checkResponseError(response)
        section.data.section.items = await source.parser.parseHomeSection(
            cheerio.load(response.data as string),
            section.data,
            source
        )
        sectionCallback(section.data.section)
    }
}

export const getViewMoreItemsMangasusu = async (
    source: MangaStream,
    homepageSectionId: string,
    metadata: any
): Promise<any> => {
    const page = metadata?.page ?? 2
    const path = homepageSectionId === 'popular_today'
        ? `komik/page/${page}/?status=&type=&order=popular`
        : `komik/page/${page}/?order=update`

    const request = App.createRequest({
        url: `${source.baseUrl}/${path}`,
        method: 'GET'
    })

    const response = await source.requestManager.schedule(request, 1)
    source.checkResponseError(response)
    const $ = cheerio.load(response.data as string)

    return App.createPagedResults({
        results: await source.parser.parseViewMore($, source),
        metadata: !source.parser.isLastPage($, 'view_more') ? { page: page + 1 } : undefined
    })
}

export const getSearchTagsMangasusu = async (source: MangaStream): Promise<any> => {
    const request = App.createRequest({
        url: `${source.baseUrl}/komik/?page=1&order=update`,
        method: 'GET'
    })

    const response = await source.requestManager.schedule(request, 1)
    source.checkResponseError(response)
    const $ = cheerio.load(response.data as string)

    return source.parser.parseTags($)
}

export const getCloudflareBypassUrlMangasusu = (baseUrl: string): string =>
    `${baseUrl}/komik/?page=1&order=update`
