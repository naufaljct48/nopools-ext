import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag } from '@paperback/types'
import * as cheerio from 'cheerio'
import {
    getTableValue,
    imageFromElement,
    parseDate,
    parseStatus,
    slugFromUrl,
    TYPES
} from './DoujinDesuHelper'

export const parseMangaDetails = ($: cheerio.CheerioAPI, mangaId: string): SourceManga => {
    const titleElement = $('section.metadata h1.title').first().clone()
    const alternativeTitle = titleElement.find('span.alter').text().trim()
    titleElement.find('span.alter').remove()
    const title = titleElement.text().trim().replace(/\s+/g, ' ')
    const titles = [title]
    if (alternativeTitle) titles.push(alternativeTitle)

    const author = getTableValue($, 'Author') || getTableValue($, 'Group') || 'Unknown'
    const artist = getTableValue($, 'Artist') || author
    const status = parseStatus(getTableValue($, 'Status'))
    const series = getTableValue($, 'Series') || getTableValue($, 'Serialization')
    const description = $('section.metadata div.pb-2').text().trim().replace(/\s+/g, ' ')
    const image = imageFromElement($, $('figure.thumbnail img').first())
    const tags: Tag[] = []

    for (const tag of $('section.metadata div.tags a').toArray()) {
        const label = $(tag).text().trim()
        const id = slugFromUrl($(tag).attr('href') ?? '')
        if (id && label) tags.push(App.createTag({ id, label }))
    }

    const descParts = []
    if (description) descParts.push(description)
    if (alternativeTitle) descParts.push(`Judul Alternatif: ${alternativeTitle}`)
    if (series) descParts.push(`Seri: ${series}`)

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image,
            status,
            author,
            artist,
            desc: descParts.join('\n\n'),
            tags: [App.createTagSection({ id: 'genres', label: 'Genres', tags })]
        })
    })
}

export const parseChapterList = ($: cheerio.CheerioAPI, mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    let sortingIndex = 0

    for (const element of $('#chapter_list li').toArray()) {
        const $chapter = $(element)
        const href = $chapter.find('span.lchx a').first().attr('href')
            ?? $chapter.find('a[href*="chapter"]').first().attr('href') ?? ''
        const id = slugFromUrl(href)
        const chapterText = $chapter.find('div.epsright chapter').first().text().trim()
            || $chapter.find('span.eps').first().text().trim()
        const chapNum = Number(chapterText.match(/\d+(?:\.\d+)?/)?.[0] ?? '0')
        const name = $chapter.find('span.lchx a').first().text().trim() || `Chapter ${chapterText}`
        const time = parseDate($chapter.find('span.date').first().text().trim())

        if (!id) continue

        chapters.push(App.createChapter({
            id,
            chapNum,
            name,
            time,
            langCode: '🇮🇩',
            sortingIndex: sortingIndex--
        }))
    }

    return chapters
}

export const parseChapterDetails = (
    _$: cheerio.CheerioAPI,
    mangaId: string,
    chapterId: string
): ChapterDetails => {
    const pages = _$('img').toArray()
        .map((img) => imageFromElement(_$, _$(img)))
        .filter(Boolean)

    if (pages.length === 0) throw new Error(`Unable to find pages for ${chapterId}`)

    return App.createChapterDetails({ id: chapterId, mangaId, pages })
}

export const parseMangaList = ($: cheerio.CheerioAPI): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []

    for (const element of $('#archives div.entries article.entry').toArray()) {
        const $entry = $(element)
        const href = $entry.find('a[href*="/manga/"]').first().attr('href') ?? ''
        const mangaId = slugFromUrl(href)
        const title = $entry.find('h3.title').first().text().trim()
            || $entry.find('a').first().attr('title') || ''
        const image = imageFromElement($, $entry.find('figure.thumbnail img').first())
        const subtitle = $entry.find('div.artists span').first().text().trim()

        if (!mangaId || !title || !image) continue

        results.push(App.createPartialSourceManga({ mangaId, image, title, subtitle }))
    }

    return results
}

export const parseSearchTags = ($: cheerio.CheerioAPI) => {
    const genres: any[] = []

    for (const element of $('section#taxonomy div.entry a[href*="/genre/"]').toArray()) {
        const label = $(element).find('span.name').text().trim() || $(element).attr('title') || ''
        const id = slugFromUrl($(element).attr('href') ?? '')
        if (id && label) genres.push(App.createTag({ id: `genre:${id}`, label }))
    }

    return [
        App.createTagSection({
            id: 'type',
            label: 'Type',
            tags: TYPES.map((type) => App.createTag({ id: `type:${type}`, label: type }))
        }),
        App.createTagSection({
            id: 'genre',
            label: 'Genres',
            tags: genres
        })
    ]
}
