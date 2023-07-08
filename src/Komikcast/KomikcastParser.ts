
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
            const date = convertDate($('span.chapterdate', chapter).text().trim(), source)
            const id = title.replace('Chapter ', ''); // Set data-num attribute as id
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
        var _a, _b;
        const pages: string[] = []
        for (const p of $('img', 'div.main-reading-area').toArray()) {
            let image = (_a = $(p).attr('src')) !== null && _a !== void 0 ? _a : '';
            if (!image)
                image = (_b = $(p).attr('data-src')) !== null && _b !== void 0 ? _b : '';
            if (!image)
                throw new Error(`Unable to parse image(s) for chapterID: ${chapterId}`);
            pages.push(image);
        }

        const chapterDetails = App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages
        })

        return chapterDetails
    }

}