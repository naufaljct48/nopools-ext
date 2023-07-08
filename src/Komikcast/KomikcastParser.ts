
import { convertDate } from '../LanguageUtils';
import { MangaStreamParser } from '../MangaStreamParser'
import { ChapterDetails } from '@paperback/types'

export class KomikcastParser extends MangaStreamParser {

    override parseMangaDetails($: CheerioStatic, mangaId: string, source: any): SourceManga {
        const titles: string[] = []
        titles.push(this.decodeHTMLEntity($('h1.komik_info-content-body-title').text().trim().replace(/Komik|Manhwa|Manga|Manhua|Bahasa Indonesia/g, '')));

        const altTitles = $(`span:contains(${source.manga_selector_AlternativeTitles}), b:contains(${source.manga_selector_AlternativeTitles})+span, .imptdt:contains(${source.manga_selector_AlternativeTitles}) i, h1.entry-title+span`).contents().remove().last().text().split(',') // Language dependant
        for (const title of altTitles) {
            if (title == '') {
                continue
            }
            titles.push(this.decodeHTMLEntity(title.trim()))
        }

        const author = $(`.komik_info-content-info:contains(${source.manga_selector_author})`).contents().remove().last().text().trim() // Language dependant
        const artist = $(`span:contains(${source.manga_selector_artist}), .fmed b:contains(${source.manga_selector_artist})+span, td:contains(${source.manga_selector_artist})+td, .imptdt:contains(${source.manga_selector_artist}) i`).contents().remove().last().text().trim() // Language dependant
        const image = this.getImageSrc($('img', 'div[itemprop="image"]'))
        const description = this.decodeHTMLEntity($('div[itemprop="articleBody"]  p').text().trim())

        const arrayTags: Tag[] = []
        for (const tag of $('a', 'span.komik_info-content-genre').toArray()) {
            const label = $(tag).text().trim()
            const id = this.idCleaner($(tag).attr('href') ?? '')
            if (!id || !label) {
                continue
            }
            arrayTags.push({ id, label })
        }

        const rawStatus = $(`.komik_info-content-info b:contains(${source.manga_selector_status})`).contents().remove().last().text().trim()
        let status
        switch (rawStatus.toLowerCase()) {
            case source.manga_StatusTypes.ONGOING.toLowerCase():
                status = 'Ongoing'
                break
            case source.manga_StatusTypes.COMPLETED.toLowerCase():
                status = 'Completed'
                break
            default:
                status = 'Ongoing'
                break
        }

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
                author: author == '' ? 'Unknown' : author,
                artist: artist == '' ? 'Unknown' : artist,
                tags: tagSections,
                desc: description
            })
        })
    }

    override parseChapterList($: CheerioSelector, mangaId: string, source: any): Chapter[] {
        const chapters: Chapter[] = []
        let sortingIndex = 0
        let language = source.language

        // Usually for Manhwa sites
        if (mangaId.toUpperCase().endsWith('-RAW') && source.language == '🇬🇧') language = '🇮🇩'

        for (const chapter of $('li', 'div.komik_info-chapters').toArray()) {
            const title = $('a.chapter-link-item', chapter).text().trim()
            const date = convertDate($('div.chapter-link-time', chapter).text().trim(), source)
            const id = title.replace('Chapter') ?? '' // Set data-num attribute as id
            const chapterNumberRegex = id.match(/(\d+\.?\d?)+/)
            let chapterNumber = 0
            if (chapterNumberRegex && chapterNumberRegex[1]) {
                chapterNumber = Number(chapterNumberRegex[1])
            }

            if (!id || typeof id === 'undefined') {
                throw new Error(`Could not parse out ID when getting chapters for postId:${mangaId}`)
            }

            chapters.push({
                id: id, // Store chapterNumber as id
                langCode: language,
                chapNum: chapterNumber,
                name: title,
                time: date,
                sortingIndex,
                volume: 0,
                group: ''
            })
            sortingIndex--
        }

        // If there are no chapters, throw error to avoid losing progress
        if (chapters.length == 0) {
            throw new Error(`Couldn't find any chapters for mangaId: ${mangaId}!`)
        }

        return chapters.map((chapter) => {
            chapter.sortingIndex += chapters.length
            return App.createChapter(chapter)
        })
    }

    override parseChapterDetails($: CheerioStatic, mangaId: string, chapterId: string): ChapterDetails {
        // const data = $.html()
    
        const pages: string[] = []
    
        const obj = $('img', 'div.main-reading-area').toArray()
    
        if (obj.length === 0) {
            throw new Error(`Failed to find page details script for manga ${mangaId}`)
        }
    
        for (const index of obj) {
            const images = $(index).attr('src')
            if (!images) continue
            pages.push(encodeURI(images))
        }
    
        const chapterDetails = App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages
        })
    
        return chapterDetails
    }

    override parseTags($: CheerioSelector): TagSection[] {
        const tagSections: any[] = [
            { id: '0', label: 'genres', tags: [] },
            { id: '1', label: 'status', tags: [] },
            { id: '2', label: 'type', tags: [] },
            { id: '3', label: 'order', tags: [] }
        ]

        const sectionDropDowns = $('ul.komiklist_dropdown-menu genrez').toArray()
        for (let i = 0; i < 4; ++i) {
            const sectionDropdown = sectionDropDowns[i]
            if (!sectionDropdown) {
                continue
            }

            for (const tag of $('li', sectionDropdown).toArray()) {
                const label = $('label', tag).text().trim()
                const id = `${tagSections[i].label}:${$('input', tag).attr('value')}`

                if (!id || !label) {
                    continue
                }

                tagSections[i].tags.push(App.createTag({ id, label }))
            }
        }

        return tagSections.map((x) => App.createTagSection(x))
    }

    override async parseSearchResults($: CheerioSelector, source: any): Promise<any[]> {
        const results: any[] = []

        for (const obj of $('div.list-update_item', 'div.list-update_items-wrapper').toArray()) {
            const slug: string = ($('a', obj).attr('href') ?? '').replace(/\/$/, '').split('/').pop() ?? ''
            const path: string = ($('a', obj).attr('href') ?? '').replace(/\/$/, '').split('/').slice(-2).shift() ?? ''
            if (!slug || !path) {
                throw new Error(`Unable to parse slug (${slug}) or path (${path})!`)
            }

            const title: string = $('h3.title', obj) ?? ''
            const image = this.getImageSrc($('img', obj)) ?? ''
            const subtitle = $('div.chapter', obj).text().trim()

            results.push({
                slug,
                path,
                image: image || source.fallbackImage,
                title: this.decodeHTMLEntity(title),
                subtitle: this.decodeHTMLEntity(subtitle)
            })
        }

        return results
    }

    override async parseViewMore($: CheerioStatic, source: any): Promise<PartialSourceManga[]> {
        const items: PartialSourceManga[] = []

        for (const manga of $('div.list-update_item', 'div.list-update_items-wrapper').toArray()) {
            const title = $('h3.title', manga).text();
            const image = this.getImageSrc($('img', manga)) ?? ''
            const subtitle = $('div.chapter', manga).text().trim()

            const slug: string = this.idCleaner($('a', manga).attr('href') ?? '')
            const path: string = ($('a', manga).attr('href') ?? '').replace(/\/$/, '').split('/').slice(-2).shift() ?? ''
            const postId = $('a', manga).attr('rel')
            const mangaId: string = await source.getUsePostIds() ? (isNaN(Number(postId)) ? await source.slugToPostId(slug, path) : postId) : slug

            if (!mangaId || !title) {
                console.log(`Failed to parse homepage sections for ${source.baseUrl}`)
                continue
            }

            items.push(App.createPartialSourceManga({
                mangaId,
                image: image,
                title: this.decodeHTMLEntity(title),
                subtitle: this.decodeHTMLEntity(subtitle)
            }))
        }

        return items
    }

    override isLastPage = ($: CheerioStatic, id: string): boolean => {
        let isLast = true
        if (id == 'view_more') {
            const hasNext = Boolean($('a.next.page-numbers')[0])
            if (hasNext) {
                isLast = false
            }
        }

        if (id == 'search_request') {
            const hasNext = Boolean($('a.next.page-numbers')[0])
            if (hasNext) {
                isLast = false
            }
        }

        return isLast
    }

}