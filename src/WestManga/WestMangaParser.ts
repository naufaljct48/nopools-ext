import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { decode as decodeHTMLEntity } from 'html-entities'
import { CheerioAPI } from 'cheerio'
import { extractMangaDataFromElement, extractChapterDataFromElement, parseRelativeDate, getImageSrc } from './WestMangaHelper'

// Parser bergaya Shinigami: fungsi-fungsi ekspor, bukan class

export const parseMangaDetails = ($: CheerioAPI, mangaId: string): SourceManga => {
    const titles: string[] = []

    const title = $('div[data-slot="card-title"]').first().text().trim()
    if (title) titles.push(decodeHTMLEntity(title))

    const image = getImageSrc($('img[alt="Comic Cover"]').first())

    const description = decodeHTMLEntity($('p.text-muted-foreground').first().text().trim())

    const tableRows = $('tbody[data-slot="table-body"] tr')
    let author = 'Unknown'
    let status = 'Unknown'

    tableRows.each((_, row) => {
        const label = $('td:first-child', row).text().trim().toLowerCase()
        const value = $('td:last-child', row).text().trim()
        if (label.includes('author')) author = value || 'Unknown'
        if (label.includes('status')) status = value.toLowerCase().includes('ongoing') ? 'Ongoing' : (value ? 'Completed' : 'Unknown')
    })

    const arrayTags: Tag[] = []
    $('div.flex.flex-wrap.gap-1 a').each((_, el) => {
        const label = $('span', el).text().trim()
        const href = $(el).attr('href') || ''
        const match = href.match(/genre%5B%5D=(\d+)/)
        const id = match ? match[1] : ''
        if (id && label) arrayTags.push({ id, label })
    })

    const tagSections: TagSection[] = [App.createTagSection({ id: '0', label: 'genres', tags: arrayTags.map((x) => App.createTag(x)) })]

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image,
            status,
            author,
            artist: author,
            tags: tagSections,
            desc: description
        })
    })
}

export const parseChapterList = ($: CheerioAPI, mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    let sortingIndex = 0

    // Container list chapter
    $('div.grid div[data-slot="card"]').each((_, card) => {
        const data = extractChapterDataFromElement(card)
        const date = parseRelativeDate(data.dateText)
        if (data.url) {
            chapters.push(App.createChapter({
                id: data.url, // gunakan path /view/ sebagai chapterId
                langCode: 'ID',
                chapNum: data.chapterNumber,
                name: data.chapterText,
                time: date,
                sortingIndex: sortingIndex--,
                volume: 0,
                group: ''
            }))
        }
    })

    if (chapters.length === 0) {
        throw new Error(`Couldn't find any chapters for mangaId: ${mangaId}!`)
    }

    return chapters.map((c, i) => ({ ...c, sortingIndex: c.sortingIndex + chapters.length }))
}

export const parseChapterDetails = ($: CheerioAPI, mangaId: string, chapterId: string): ChapterDetails => {
    const pages: string[] = []
    $('div.flex.flex-col.items-center.mb-4 img').each((_, img) => {
        const src = $(img).attr('src')?.trim()
        if (src) pages.push(encodeURI(src))
    })

    if (pages.length === 0) throw new Error(`Failed to find any pages for chapter ${chapterId} of manga ${mangaId}`)

    return App.createChapterDetails({ id: chapterId, mangaId, pages })
}

// Digunakan untuk homepage sections dan hasil pencarian (contents)
export const parseMangaList = (data: any): PartialSourceManga[] => {
    const $: CheerioAPI = data.$
    const scope: string | undefined = data.scope

    let cards = [] as any[]

    if (scope === 'popular_today') {
        // Tab "Sepanjang Waktu" (id berakhiran -content-all_time)
        const panel = $('div[id$="-content-all_time"]')
        cards = panel.find('div.overflow-hidden').toArray()
    } else {
        // Latest Update atau grid umum pada /contents
        cards = $('div.grid').filter((_, el) => {
            const cls = $(el).attr('class') || ''
            return /grid-cols-(3|5)/.test(cls)
        }).find('> div.overflow-hidden').toArray()
    }

    const results: PartialSourceManga[] = []
    for (const card of cards) {
        const d = extractMangaDataFromElement(card)
        if (!d.mangaId || !d.title) continue
        results.push(App.createPartialSourceManga({
            mangaId: d.mangaId,
            image: d.image,
            title: decodeHTMLEntity(d.title),
            subtitle: decodeHTMLEntity(d.chapterInfo)
        }))
    }

    return results
}