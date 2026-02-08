import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { decodeHTMLEntity, convertTime, normalizeUrl } from './KiryuuHelper'

// Regex-based HTML parsing helpers
const extractText = (html: string, regex: RegExp): string => {
    const match = html.match(regex)
    return match?.[1]?.trim() ?? ''
}

export const parseMangaDetails = (html: string, mangaId: string): SourceManga => {
    const titles: string[] = []

    // Extract main title
    const mainTitle = extractText(html, /<h1[^>]*itemprop=["']name["'][^>]*>(.*?)<\/h1>/is)
    if (mainTitle) titles.push(decodeHTMLEntity(mainTitle.replace(/<[^>]*>/g, '')))

    // Extract alt title
    const altTitle = extractText(html, /<[^>]*class=["'][^"']*text-sm\.text-text\.line-clamp-1[^"']*["'][^>]*>(.*?)<\/[^>]*>/is)
    if (altTitle) {
        const altTitles = altTitle.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        titles.push(...altTitles.map((t: string) => decodeHTMLEntity(t.replace(/<[^>]*>/g, ''))))
    }

    // Extract image
    let image = ''
    const imageMatch = html.match(/<[^>]*itemprop=["']image["'][^>]*>.*?<img[^>]*src=["']([^"']+)["'][^>]*>/is)
    if (imageMatch) image = imageMatch[1]
    if (!image) image = extractText(html, /<img[^>]*class=["'][^"']*wp-post-image[^"']*["'][^>]*src=["']([^"']+)["']/i)

    image = normalizeUrl(image)

    // Extract status
    const statusText = extractText(html, /<[^>]*class=["'][^"']*bg-accent[^"']*["'][^>]*>(.*?)<\/[^>]*>/i).toLowerCase()
    const status = statusText.includes('ongoing') ? 'Ongoing' : statusText.includes('completed') ? 'Completed' : 'Unknown'

    // Extract author
    let author = 'Unknown'
    const authorMatch = html.match(/<h4[^>]*>(.*?)author(.*?)<\/h4>.*?<[^>]*class=["'][^"']*inline[^"']*["'][^>]*>(.*?)<\/[^>]*>/is)
    if (authorMatch) author = authorMatch[3].replace(/<[^>]*>/g, '').trim() || 'Unknown'

    // Extract genres
    const arrayTags: Tag[] = []
    const genreMatches = html.matchAll(/<a[^>]*itemprop=["']genre["'][^>]*>.*?<span[^>]*>(.*?)<\/span>.*?href=["'][^"']*\/genre\/([^"']+)["']/gis)
    for (const match of genreMatches) {
        const label = match[1].replace(/<[^>]*>/g, '').trim()
        const id = match[2]
        if (id && label) arrayTags.push({ id, label: decodeHTMLEntity(label) })
    }

    const tagSections: TagSection[] = []
    if (arrayTags.length > 0) {
        tagSections.push(App.createTagSection({
            id: '0', label: 'genres', tags: arrayTags.map((x: Tag) => App.createTag(x))
        }))
    }

    // Extract description
    let desc = extractText(html, /<div[^>]*itemprop=["']description["'][^>]*data-show=["']true["'][^>]*>(.*?)<\/div>/is)
    if (!desc) desc = extractText(html, /<div[^>]*itemprop=["']description["'][^>]*data-show=["']false["'][^>]*>(.*?)<\/div>/is)
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
    const chapters: Chapter[] = []
    let sortingIndex = 0

    // Match chapter divs
    const chapterMatches = html.matchAll(/<div[^>]*data-chapter-number=["']([^"']+)["'][^>]*>(.*?)<\/div>\s*<\/div>/gis)

    for (const match of chapterMatches) {
        const chapNumStr = match[1]
        const chapNum = parseFloat(chapNumStr) || 0
        const chapterHtml = match[2]

        // Extract chapter link
        const linkMatch = chapterHtml.match(/<a[^>]*href=["'][^"']*\/chapter\/([^"\/]+)["']/i)
        const chapterId = linkMatch?.[1] ?? ''
        if (!chapterId) continue

        // Extract title
        const title = extractText(chapterHtml, /<[^>]*class=["'][^"']*font-medium\.text-base[^"']*["'][^>]*>.*?<span[^>]*>(.*?)<\/span>/is)
        const name = title ? decodeHTMLEntity(title.replace(/<[^>]*>/g, '')) : `Chapter ${chapNumStr}`

        // Extract time
        const timeStr = chapterHtml.match(/<time[^>]*datetime=["']([^"']+)["']/)?.[1] ?? extractText(chapterHtml, /<time[^>]*>(.*?)<\/time>/is)
        const time = timeStr ? (timeStr.includes('T') ? new Date(timeStr) : convertTime(timeStr)) : new Date()

        chapters.push(App.createChapter({
            id: chapterId, chapNum, name, time, langCode: '🇮🇩', sortingIndex: sortingIndex--
        }))
    }

    return chapters
}

export const parseChapterDetails = (html: string, mangaId: string, chapterId: string): ChapterDetails => {
    const pages: string[] = []

    // Extract images from section with data-image-data
    const sectionMatch = html.match(/<section[^>]*data-image-data[^>]*>(.*?)<\/section>/is)
    if (sectionMatch) {
        const sectionHtml = sectionMatch[1]
        const imgMatches = sectionHtml.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)
        for (const match of imgMatches) {
            const src = match[1]
            if (src && !src.includes('data:image')) pages.push(normalizeUrl(src))
        }
    }

    if (pages.length === 0) {
        throw new Error(`Failed to find any pages for chapter ${chapterId} of manga ${mangaId}`)
    }

    return App.createChapterDetails({ id: chapterId, mangaId, pages })
}

export const parseMangaList = (html: string): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []

    // Parse swiper slides
    const slideMatches = html.matchAll(/<div[^>]*class=["'][^"']*swiper-slide[^"']*["'][^>]*>(.*?)<\/div>\s*<\/div>/gis)
    for (const match of slideMatches) {
        const slideHtml = match[1]
        const linkMatch = slideHtml.match(/<a[^>]*href=["'][^"']*\/manga\/([^"\/]+)["'][^>]*title=["']([^"']+)["']/i)
        if (!linkMatch) continue

        const mangaId = linkMatch[1]
        const title = linkMatch[2]
        const imgMatch = slideHtml.match(/<img[^>]*src=["']([^"']+)["']/i)
        const image = imgMatch ? normalizeUrl(imgMatch[1]) : ''
        const subtitle = extractText(slideHtml, /<[^>]*class=["'][^"']*text-sm\.text-gray-300[^"']*["'][^>]*>(.*?)<\/[^>]*>/is)

        if (title) {
            results.push(App.createPartialSourceManga({
                mangaId, image, title: decodeHTMLEntity(title),
                subtitle: subtitle ? decodeHTMLEntity(subtitle.replace(/<[^>]*>/g, '')) : ''
            }))
        }
    }

    return results
}

export const parseSearchTags = (html: string): TagSection[] => {
    const genres: Tag[] = []
    const types: Tag[] = []

    // Extract genres from buttons
    const genreMatches = html.matchAll(/<button[^>]*data-genre=["']([^"']+)["'][^>]*>(.*?)<\/button>/gis)
    for (const match of genreMatches) {
        const id = match[1]
        const label = match[2].replace(/<[^>]*>/g, '').trim()
        if (id && label) genres.push({ id, label: decodeHTMLEntity(label) })
    }

    // Fallback genres
    if (genres.length === 0) {
        genres.push(
            { id: 'action', label: 'Action' }, { id: 'adventure', label: 'Adventure' },
            { id: 'comedy', label: 'Comedy' }, { id: 'drama', label: 'Drama' },
            { id: 'fantasy', label: 'Fantasy' }, { id: 'isekai', label: 'Isekai' },
            { id: 'romance', label: 'Romance' }, { id: 'shounen', label: 'Shounen' }
        )
    }

    // Extract types
    const typeMatches = html.matchAll(/<button[^>]*data-type=["']([^"']+)["'][^>]*>(.*?)<\/button>/gis)
    for (const match of typeMatches) {
        const id = match[1]
        const label = match[2].replace(/<[^>]*>/g, '').trim()
        if (id && label && !types.find((t: Tag) => t.id === id)) types.push({ id, label: decodeHTMLEntity(label) })
    }

    if (types.length === 0) {
        types.push({ id: 'manga', label: 'Manga' }, { id: 'manhwa', label: 'Manhwa' }, { id: 'manhua', label: 'Manhua' })
    }

    const sections: TagSection[] = []
    if (genres.length > 0) sections.push(App.createTagSection({ id: 'genre', label: 'Genres', tags: genres.map((x: Tag) => App.createTag(x)) }))
    if (types.length > 0) sections.push(App.createTagSection({ id: 'type', label: 'Type', tags: types.map((x: Tag) => App.createTag(x)) }))
    sections.push(App.createTagSection({ id: 'status', label: 'Status', tags: [{ id: 'ongoing', label: 'Ongoing' }, { id: 'completed', label: 'Completed' }].map((x) => App.createTag(x)) }))

    return sections
}
