import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { decodeHTMLEntity, convertTime, normalizeUrl } from './KiryuuHelper'

const cheerio = require('cheerio') as any

// Regex-based HTML parsing helpers
const extractText = (html: string, regex: RegExp): string => {
    const match = html.match(regex)
    return match?.[1]?.trim() ?? ''
}

export const parseMangaDetails = (html: string, mangaId: string): SourceManga => {
    const $ = cheerio.load(html)
    const titles: string[] = []

    const mainTitle = $('h1[itemprop="name"]').first().text().trim() || extractText(html, /<h1[^>]*itemprop=["']name["'][^>]*>(.*?)<\/h1>/is)
    if (mainTitle) titles.push(decodeHTMLEntity(mainTitle.replace(/<[^>]*>/g, '')))

    const altTitle = $('h1[itemprop="name"]').first().next('div').text().trim()
    if (altTitle) {
        const altTitles = altTitle.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        titles.push(...altTitles.map((t: string) => decodeHTMLEntity(t.replace(/<[^>]*>/g, ''))))
    }

    const image = normalizeUrl($('[itemprop="image"] img').first().attr('src') ?? $('img.wp-post-image').first().attr('src') ?? '')

    const statusText = html.toLowerCase()
    const status = statusText.includes('ongoing') ? 'Ongoing' : statusText.includes('completed') ? 'Completed' : 'Unknown'

    let author = 'Unknown'
    $('h4').each((_: number, element: any) => {
        const label = $(element).text().toLowerCase()
        if (label.includes('author') || label.includes('artist')) {
            const value = $(element).parent().find('p').first().text().trim()
            if (value) author = value
        }
    })

    const arrayTags: Tag[] = []
    $('a[itemprop="genre"]').each((_: number, element: any) => {
        const label = $(element).text().trim()
        const id = ($(element).attr('href') ?? '').match(/\/genre\/([^/]+)\/?/)?.[1] ?? ''
        if (id && label) arrayTags.push({ id, label: decodeHTMLEntity(label) })
    })

    const tagSections: TagSection[] = []
    if (arrayTags.length > 0) {
        tagSections.push(App.createTagSection({
            id: '0', label: 'genres', tags: arrayTags.map((x: Tag) => App.createTag(x))
        }))
    }

    let desc = $('[itemprop="description"][data-show="true"]').first().text().trim()
    if (!desc) desc = $('[itemprop="description"]').last().text().trim()
    desc = desc.replace(/<[^>]*>/g, '').trim()

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles, image, status, author, artist: author, tags: tagSections,
            desc: decodeHTMLEntity(desc)
        })
    })
}

export const parseChapterList = (html: string, mangaId: string): Chapter[] => {
    const $ = cheerio.load(html)
    const chapters: Chapter[] = []
    let sortingIndex = 0

    $('#chapter-list div[data-chapter-number]').each((_: number, element: any) => {
        const $chapter = $(element)
        const chapNumStr = $chapter.attr('data-chapter-number') ?? '0'
        const chapNum = parseFloat(chapNumStr) || 0
        const href = $chapter.find('a[href*="/chapter-"]').first().attr('href') ?? ''
        const chapterId = href.match(/\/manga\/[^/]+\/([^/]+)\/?/)?.[1] ?? ''
        if (!chapterId) return

        const title = $chapter.find('span').first().text().trim()
        const name = title ? decodeHTMLEntity(title.replace(/<[^>]*>/g, '')) : `Chapter ${chapNumStr}`

        const timeStr = $chapter.find('time').first().attr('datetime') ?? $chapter.find('time').first().text().trim()
        const time = timeStr ? (timeStr.includes('T') ? new Date(timeStr) : convertTime(timeStr)) : new Date()

        chapters.push(App.createChapter({
            id: chapterId, chapNum, name, time, langCode: '🇮🇩', sortingIndex: sortingIndex--
        }))
    })

    return chapters
}

export const parseChapterDetails = (html: string, mangaId: string, chapterId: string): ChapterDetails => {
    const $ = cheerio.load(html)
    const pages: string[] = []

    $('section[data-image-data] img').each((_: number, element: any) => {
        const src = $(element).attr('src') ?? ''
        if (src && !src.includes('data:image')) pages.push(normalizeUrl(src))
    })

    if (pages.length === 0) {
        throw new Error(`Failed to find any pages for chapter ${chapterId} of manga ${mangaId}`)
    }

    return App.createChapterDetails({ id: chapterId, mangaId, pages })
}

export const parseMangaList = (html: string): PartialSourceManga[] => {
    const $ = cheerio.load(html)
    const results: PartialSourceManga[] = []
    const seen = new Set<string>()

    $('a[href*="/manga/"]').each((_: number, element: any) => {
        const $link = $(element)
        const href = $link.attr('href') ?? ''
        const mangaId = href.match(/\/manga\/([^/]+)\/?$/)?.[1] ?? ''
        if (!mangaId || seen.has(mangaId)) return

        const image = $link.find('img').first().attr('src') ?? ''
        if (!image) return

        let title = $link.find('img').first().attr('alt') ?? ''
        const $card = $link.parent().parent()
        const cardTitle = $card.find(`a[href$="/manga/${mangaId}/"]`).filter((_: number, titleElement: any) => $(titleElement).text().trim().length > 0).first().text().trim()
        if (cardTitle) title = cardTitle

        const subtitle = $card.find('a[href*="/chapter-"] p').first().text().trim()
        seen.add(mangaId)
        results.push(App.createPartialSourceManga({
            mangaId,
            image: normalizeUrl(image),
            title: decodeHTMLEntity(title.trim() || mangaId),
            subtitle: decodeHTMLEntity(subtitle)
        }))
    })

    return results
}

export const parseSearchTags = (html: string): TagSection[] => {
    const genres: Tag[] = []
    const types: Tag[] = [
        { id: 'type:manga', label: 'Manga' },
        { id: 'type:manhwa', label: 'Manhwa' },
        { id: 'type:manhua', label: 'Manhua' }
    ]

    const start = html.indexOf('var searchTerms = ')
    const end = start >= 0 ? html.indexOf('};', start) : -1
    if (start >= 0 && end > start) {
        try {
            const rawJson = html.slice(start + 'var searchTerms = '.length, end + 1)
            const searchTerms = JSON.parse(rawJson)
            const rawGenres = Array.isArray(searchTerms?.genre) ? searchTerms.genre : []
            for (const genre of rawGenres) {
                const slug = String(genre?.slug ?? '').trim()
                const label = String(genre?.name ?? '').trim()
                if (slug && label) genres.push({ id: `genre:${slug}`, label: decodeHTMLEntity(label) })
            }
        } catch (e) {
        }
    }

    if (genres.length === 0) {
        genres.push(
            { id: 'genre:action', label: 'Action' }, { id: 'genre:adventure', label: 'Adventure' },
            { id: 'genre:comedy', label: 'Comedy' }, { id: 'genre:drama', label: 'Drama' },
            { id: 'genre:fantasy', label: 'Fantasy' }, { id: 'genre:isekai', label: 'Isekai' },
            { id: 'genre:romance', label: 'Romance' }, { id: 'genre:shounen', label: 'Shounen' }
        )
    }

    const sections: TagSection[] = []
    if (genres.length > 0) sections.push(App.createTagSection({ id: 'genre', label: 'Genres', tags: genres.map((x: Tag) => App.createTag(x)) }))
    if (types.length > 0) sections.push(App.createTagSection({ id: 'type', label: 'Type', tags: types.map((x: Tag) => App.createTag(x)) }))
    sections.push(App.createTagSection({ id: 'status', label: 'Status', tags: [{ id: 'status:ongoing', label: 'Ongoing' }, { id: 'status:completed', label: 'Completed' }].map((x) => App.createTag(x)) }))

    return sections
}
