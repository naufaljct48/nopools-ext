import {
    Chapter,
    ChapterDetails,
    PartialSourceManga,
    SourceManga,
    Tag,
    TagSection
} from '@paperback/types'
import { decode as decodeHTMLEntity } from 'html-entities'
import {
    Cheerio,
    CheerioAPI
} from 'cheerio'
import { Element } from 'domhandler'

import { HomeSectionData } from '../MangaStreamHelper'
import { convertDate } from '../LanguageUtils'
import { MangaStreamParser } from '../MangaStreamParser'
import {
    extractMangaDataFromElement,
    extractChapterDataFromElement,
    parseRelativeDate
} from './WestMangaHelper'

export class WestMangaParser extends MangaStreamParser {

    override parseMangaDetails($: CheerioAPI, mangaId: string, source: any): SourceManga {
        const titles: string[] = []
        
        // Extract title from the specific div structure
        const title = $('div[data-slot="card-title"]').text().trim()
        titles.push(decodeHTMLEntity(title))

        // Extract image
        const image = this.getImageSrc($('img[alt="Comic Cover"]'))

        // Extract description
        const description = decodeHTMLEntity($('p.text-muted-foreground').first().text().trim())

        // Extract metadata from table
        const tableRows = $('tbody[data-slot="table-body"] tr')
        let author = 'Unknown'
        let status = 'Ongoing'
        let type = 'comic'

        tableRows.each((_: any, row: any) => {
            const label = $('td:first-child', row).text().trim().toLowerCase()
            const value = $('td:last-child', row).text().trim()

            if (label.includes('author')) {
                author = value || 'Unknown'
            } else if (label.includes('status')) {
                status = value.toLowerCase().includes('ongoing') ? 'Ongoing' : 'Completed'
            } else if (label.includes('type')) {
                type = value
            }
        })

        // Extract genres
        const arrayTags: Tag[] = []
        $('div.flex.flex-wrap.gap-1 a').each((_: any, element: any) => {
            const label = $('span', element).text().trim()
            const href = $(element).attr('href') || ''
            const id = this.extractGenreId(href)
            
            if (id && label) {
                arrayTags.push({ id, label })
            }
        })

        const tagSections: TagSection[] = [
            App.createTagSection({
                id: '0',
                label: 'genres',
                tags: arrayTags.map((x) => App.createTag(x))
            })
        ]

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles,
                image: image,
                status,
                author: author,
                artist: author, // Using author as artist since not separately specified
                tags: tagSections,
                desc: description
            })
        })
    }

    override parseChapterList($: CheerioAPI, mangaId: string, source: any): Chapter[] {
        const chapters: Chapter[] = []
        let sortingIndex = 0

        // Find chapter list container
        const chapterContainer = $('div.grid.grid-cols-2')
        
        chapterContainer.find('div[data-slot="card"]').each((_: any, chapterElement: any) => {
            const chapterData = extractChapterDataFromElement(chapterElement)
            const date = parseRelativeDate(chapterData.dateText)

            if (chapterData.url) {
                chapters.push({
                    id: chapterData.url, // gunakan path /view/... langsung sebagai chapterId
                    langCode: source.language,
                    chapNum: chapterData.chapterNumber,
                    name: chapterData.chapterText,
                    time: date,
                    sortingIndex,
                    volume: 0,
                    group: ''
                })
                sortingIndex--
            }
        })

        // If there are no chapters, throw error to avoid losing progress
        if (chapters.length == 0) {
            throw new Error(`Couldn't find any chapters for mangaId: ${mangaId}!`)
        }

        return chapters.map((chapter) => {
            chapter.sortingIndex += chapters.length
            return App.createChapter(chapter)
        })
    }

    override parseChapterDetails($: CheerioAPI, mangaId: string, chapterId: string): ChapterDetails {
        const pages: string[] = []

        // Extract images from the chapter page
        $('div.flex.flex-col.items-center.mb-4 img').each((_: any, img: any) => {
            const src = $(img).attr('src')
            if (src) {
                pages.push(encodeURI(src.trim()))
            }
        })

        if (pages.length === 0) {
            throw new Error(`Failed to find any pages for chapter ${chapterId} of manga ${mangaId}`)
        }

        const chapterDetails = App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages
        })

        return chapterDetails
    }

    override parseTags($: CheerioAPI): TagSection[] {
        const tagSections: any[] = [
            { id: '0', label: 'genres', tags: [] },
            { id: '1', label: 'status', tags: [] },
            { id: '2', label: 'type', tags: [] },
            { id: '3', label: 'order', tags: [] }
        ]

        // This would need to be implemented based on the actual search/filter page structure
        // For now, returning empty sections
        
        return tagSections.map((x) => App.createTagSection(x))
    }

    override async parseSearchResults($: CheerioAPI, source: any): Promise<any[]> {
        const results: any[] = []

        // Parse hasil dari halaman /contents (grid berisi kartu komik)
        const cards = $('div.grid.grid-cols-3, div.grid.lg\\:grid-cols-5').find('> div.overflow-hidden')
        for (const card of cards.toArray()) {
            const data = extractMangaDataFromElement(card)
            if (!data.mangaId || !data.title) continue
            results.push(App.createPartialSourceManga({
                mangaId: data.mangaId,
                image: data.image,
                title: decodeHTMLEntity(data.title),
                subtitle: decodeHTMLEntity(data.chapterInfo)
            }))
        }

        return results
    }

    override async parseViewMore($: CheerioAPI, source: any): Promise<PartialSourceManga[]> {
        const items: PartialSourceManga[] = []

        // View More juga berasal dari /contents?page=... dengan grid yang sama
        const cards = $('div.grid.grid-cols-3, div.grid.lg\\:grid-cols-5').find('> div.overflow-hidden')
        for (const card of cards.toArray()) {
            const data = extractMangaDataFromElement(card)
            if (!data.mangaId || !data.title) continue
            items.push(App.createPartialSourceManga({
                mangaId: data.mangaId,
                image: data.image,
                title: decodeHTMLEntity(data.title),
                subtitle: decodeHTMLEntity(data.chapterInfo)
            }))
        }

        return items
    }

    override async parseHomeSection($: CheerioAPI, section: HomeSectionData, source: any): Promise<PartialSourceManga[]> {
        const items: PartialSourceManga[] = []

        const mangas = section.selectorFunc($)
        if (!mangas.length) {
            console.log(`Unable to parse valid ${section.section.title} section!`)
            return items
        }

        for (const manga of mangas.toArray()) {
            const mangaData = extractMangaDataFromElement(manga)
            
            // Use the section's title and subtitle selectors if available, otherwise use the extracted data
            const title = section.titleSelectorFunc ? section.titleSelectorFunc($, manga) : mangaData.title
            const subtitle = section.subtitleSelectorFunc ? section.subtitleSelectorFunc($, manga) : mangaData.chapterInfo
            
            const mangaId: string = mangaData.mangaId

            if (!mangaId || !title) {
                console.log(`Failed to parse homepage sections for ${source.baseUrl} title (${title}) mangaId (${mangaId})`)
                continue
            }

            items.push(App.createPartialSourceManga({
                mangaId,
                image: mangaData.image,
                title: decodeHTMLEntity(title),
                subtitle: decodeHTMLEntity(subtitle)
            }))
        }

        return items
    }

    override isLastPage = ($: CheerioAPI, id: string): boolean => {
        let isLast = true
        if (id == 'view_more') {
            const hasNext = Boolean($('nav[aria-label="pagination"] a[rel="next"], a[aria-label="Next"]').length)
            if (hasNext) {
                isLast = false
            }
        }

        if (id == 'search_request') {
            const hasNext = Boolean($('nav[aria-label="pagination"] a[rel="next"], a.next.page-numbers').length)
            if (hasNext) {
                isLast = false
            }
        }

        return isLast
    }

    override getImageSrc(imageObj: Cheerio<Element> | undefined): string {
        let image: string | undefined
        if ((typeof imageObj?.attr('data-src')) != 'undefined') {
            image = imageObj?.attr('data-src')
        }
        else if ((typeof imageObj?.attr('data-lazy-src')) != 'undefined') {
            image = imageObj?.attr('data-lazy-src')
        }
        else if ((typeof imageObj?.attr('srcset')) != 'undefined') {
            image = imageObj?.attr('srcset')?.split(' ')[0] ?? ''
        }
        else if ((typeof imageObj?.attr('src')) != 'undefined') {
            image = imageObj?.attr('src')
        }
        else if ((typeof imageObj?.attr('data-cfsrc')) != 'undefined') {
            image = imageObj?.attr('data-cfsrc')
        } else {
            image = ''
        }

        image = image?.split('?resize')[0] ?? ''
        image = image.replace(/^\/\//, 'https://')
        image = image.replace(/^\//, 'https:/')

        return encodeURI(decodeURI(decodeHTMLEntity(image?.trim())))
    }

    protected override idCleaner(str: string): string {
        let cleanId: string = str
        cleanId = cleanId.replace(/\/$/, '')
        cleanId = cleanId.split('/').pop() ?? ''

        return cleanId
    }

    // Helper methods specific to WestManga structure
    private extractGenreId(href: string): string {
        const match = href.match(/genre%5B%5D=(\d+)/)
        return match ? (match[1] || '') : ''
    }
}