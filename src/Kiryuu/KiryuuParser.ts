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
    if (imageMatch?.[1]) image = imageMatch[1]
    if (!image) {
        const wpImageMatch = html.match(/<img[^>]*class=["'][^"']*wp-post-image[^"']*["'][^>]*src=["']([^"']+)["']/i)
        if (wpImageMatch?.[1]) image = wpImageMatch[1]
    }

    image = normalizeUrl(image)

    // Extract status
    const statusMatch = html.match(/<[^>]*class=["'][^"']*bg-accent[^"']*["'][^>]*>(.*?)<\/[^>]*>/i)
    const statusText = (statusMatch?.[1] ?? '').toLowerCase()
    const status = statusText.includes('ongoing') ? 'Ongoing' : statusText.includes('completed') ? 'Completed' : 'Unknown'

    // Extract author
    let author = 'Unknown'
    const authorMatch = html.match(/<h4[^>]*>(.*?)author(.*?)<\/h4>.*?<[^>]*class=["'][^"']*inline[^"']*["'][^>]*>(.*?)<\/[^>]*>/is)
    if (authorMatch?.[3]) author = authorMatch[3].replace(/<[^>]*>/g, '').trim() || 'Unknown'

    // Extract genres
    const arrayTags: Tag[] = []
    const genreMatches = html.matchAll(/<a[^>]*itemprop=["']genre["'][^>]*>.*?<span[^>]*>(.*?)<\/span>.*?href=["'][^"']*\/genre\/([^"']+)["']/gis)
    for (const match of genreMatches) {
        const label = (match[1] ?? '').replace(/<[^>]*>/g, '').trim()
        const id = match[2] ?? ''
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
        const chapNumStr = match[1] ?? '0'
        const chapNum = parseFloat(chapNumStr) || 0
        const chapterHtml = match[2] ?? ''

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
            const sectionHtml = sectionMatch[1] ?? ''
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
    const seen = new Set<string>()

    // Match wp-post-image and extract nearby manga link and title
    // This works for latest, project, and featured sections
    const imgMatches = html.matchAll(/<img[^>]*class=["'][^"']*wp-post-image[^"']*["'][^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi)
    
    for (const imgMatch of imgMatches) {
        const image = imgMatch[1] ?? ''
        const titleFromAlt = imgMatch[2] ?? ''

        if (image) {
            // Find the manga ID from nearby context (before and after the image)
            const imgPosition = html.indexOf(imgMatch[0])
            const nearbyContext = html.substring(
                Math.max(0, imgPosition - 500),
                Math.min(html.length, imgPosition + imgMatch[0].length + 1000)
            )
            
            // Extract manga ID from href
            const linkMatch = nearbyContext.match(/<a[^>]*href=["'](?:https?:\/\/[^\/]+)?\/manga\/([^"\/]+)["']/i)
            const mangaId = linkMatch?.[1] ?? ''

            if (mangaId && !seen.has(mangaId)) {
                seen.add(mangaId)
                
                // Try to find H1 title in nearby context
                let title = titleFromAlt
                const h1Match = nearbyContext.match(/<h1[^>]*class=["'][^"']*text-\[[^"']*\][^"']*["'][^>]*>\s*([^<]+?)\s*<\/h1>/i)
                if (h1Match?.[1]) {
                    title = h1Match[1].trim()
                } else {
                    // Try alternative title pattern for featured section
                    const altTitleMatch = nearbyContext.match(/<a[^>]*href=["'][^"']*\/manga\/[^"']+["'][^>]*class=["'][^"']*text-base[^"']*font-medium[^"']*["'][^>]*>\s*([^<]+?)\s*<\/a>/i)
                    if (altTitleMatch?.[1]) {
                        title = altTitleMatch[1].trim()
                    }
                }

                results.push(App.createPartialSourceManga({
                    mangaId,
                    image: normalizeUrl(image),
                    title: decodeHTMLEntity(title || mangaId),
                    subtitle: ''
                }))
            }
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
        const id = match[1] ?? ''
        const label = (match[2] ?? '').replace(/<[^>]*>/g, '').trim()
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
        const id = match[1] ?? ''
        const label = (match[2] ?? '').replace(/<[^>]*>/g, '').trim()
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
