import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { decodeHTMLEntity, convertTime, normalizeUrl } from './KiryuuHelper'

const stripTags = (value: string): string => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const extractText = (html: string, regex: RegExp): string => {
    const match = html.match(regex)
    return match?.[1]?.trim() ?? ''
}

const extractBlocks = (html: string, pattern: RegExp): Array<{ match: RegExpMatchArray, html: string }> => {
    const matches = Array.from(html.matchAll(pattern))
    const blocks: Array<{ match: RegExpMatchArray, html: string }> = []

    for (let i = 0; i < matches.length; i++) {
        const current = matches[i]
        if (!current) continue
        const start = current.index ?? 0
        const end = matches[i + 1]?.index ?? html.length
        blocks.push({ match: current, html: html.slice(start, end) })
    }

    return blocks
}

const decodeAndClean = (value: string): string => decodeHTMLEntity(stripTags(value))

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const parseMangaDetails = (html: string, mangaId: string): SourceManga => {
    const titles: string[] = []

    const mainTitle = decodeAndClean(extractText(html, /<h1[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/i))
    if (mainTitle) titles.push(mainTitle)

    const altTitle = decodeAndClean(extractText(html, /<div[^>]*class=["'][^"']*text-sm[^"']*line-clamp-1[^"']*["'][^>]*>([\s\S]*?)<\/div>/i))
    if (altTitle) {
        for (const title of altTitle.split(',').map((item) => item.trim()).filter(Boolean)) {
            if (!titles.includes(title)) titles.push(title)
        }
    }

    let image = extractText(html, /itemprop=["']image["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i)
    if (!image) image = extractText(html, /<img[^>]*src=["']([^"']+)["'][^>]*class=["'][^"']*wp-post-image/i)
    if (!image) image = extractText(html, /<img[^>]*class=["'][^"']*wp-post-image[^"']*["'][^>]*src=["']([^"']+)["']/i)

    const lowerHtml = html.toLowerCase()
    let status = 'Unknown'
    if (lowerHtml.includes('ongoing')) status = 'Ongoing'
    else if (lowerHtml.includes('completed')) status = 'Completed'
    else if (lowerHtml.includes('hiatus')) status = 'Hiatus'

    let author = 'Unknown'
    const authorRow = html.match(/<h4[^>]*>[\s\S]*?(author|artist)[\s\S]*?<\/h4>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)
    if (authorRow?.[2]) author = decodeAndClean(authorRow[2]) || 'Unknown'

    const tags: Tag[] = []
    const genreMatches = html.matchAll(/<a[^>]*itemprop=["']genre["'][^>]*href=["'][^"']*\/genre\/([^/"']+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi)
    for (const match of genreMatches) {
        const id = String(match[1] ?? '').trim()
        const label = decodeAndClean(match[2] ?? '')
        if (id && label) tags.push({ id, label })
    }

    const tagSections: TagSection[] = []
    if (tags.length > 0) {
        tagSections.push(App.createTagSection({
            id: '0',
            label: 'genres',
            tags: tags.map((tag) => App.createTag(tag))
        }))
    }

    let desc = extractText(html, /<div[^>]*itemprop=["']description["'][^>]*data-show=["']true["'][^>]*>([\s\S]*?)<\/div>/i)
    if (!desc) desc = extractText(html, /<div[^>]*itemprop=["']description["'][^>]*>([\s\S]*?)<\/div>/i)

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image: normalizeUrl(image),
            status,
            author,
            artist: author,
            tags: tagSections,
            desc: decodeAndClean(desc)
        })
    })
}

export const parseChapterList = (html: string, mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    let sortingIndex = 0

    const blocks = extractBlocks(html, /<div[^>]*data-chapter-number=["']([^"']+)["'][^>]*>/gi)
    for (const block of blocks) {
        const chapNumStr = String(block.match[1] ?? '0')
        const chapNum = parseFloat(chapNumStr) || 0
        const href = extractText(block.html, /<a[^>]*href=["']([^"']*\/manga\/[^"']+\/chapter-[^"']+)["']/i)
        const chapterId = href.match(/\/manga\/[^/]+\/([^/]+)\/?/)?.[1] ?? ''
        if (!chapterId) continue

        const title = decodeAndClean(extractText(block.html, /<span>([\s\S]*?)<\/span>/i)) || `Chapter ${chapNumStr}`
        const timeStr = extractText(block.html, /<time[^>]*datetime=["']([^"']+)["']/i) || decodeAndClean(extractText(block.html, /<time[^>]*>([\s\S]*?)<\/time>/i))
        const time = timeStr ? (timeStr.includes('T') ? new Date(timeStr) : convertTime(timeStr)) : new Date()

        chapters.push(App.createChapter({
            id: chapterId,
            chapNum,
            name: title,
            time,
            langCode: '🇮🇩',
            sortingIndex: sortingIndex--
        }))
    }

    return chapters
}

export const parseChapterDetails = (html: string, mangaId: string, chapterId: string): ChapterDetails => {
    const pages: string[] = []
    const sectionHtml = extractText(html, /<section[^>]*data-image-data[^>]*>([\s\S]*?)<\/section>/i)
    const imgMatches = sectionHtml.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)

    for (const match of imgMatches) {
        const src = String(match[1] ?? '').trim()
        if (src && !src.includes('data:image')) pages.push(normalizeUrl(src))
    }

    if (pages.length === 0) {
        throw new Error(`Failed to find any pages for chapter ${chapterId} of manga ${mangaId}`)
    }

    return App.createChapterDetails({ id: chapterId, mangaId, pages })
}

export const parseMangaList = (html: string): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []
    const seen = new Set<string>()
    const cardBlocks = extractBlocks(html, /<div>\s*<div\s+class=["'][^"']*group-data-\[direction=horizontal\]:hidden[^"']*["'][^>]*>/gi)

    if (cardBlocks.length > 0) {
        for (const card of cardBlocks) {
            const cardHtml = card.html
            const mangaId = extractText(cardHtml, /<a[^>]*href=["'](?:https?:\/\/[^"']+)?\/manga\/([^/"']+)\/?["'][^>]*>[\s\S]*?<img\b/i)
            if (!mangaId || seen.has(mangaId)) continue

            const image = extractText(cardHtml, /<a[^>]*href=["'](?:https?:\/\/[^"']+)?\/manga\/[^/"']+\/?["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i)
            if (!image) continue

            const imageTitle = decodeHTMLEntity(extractText(cardHtml, /<img[^>]*alt=["']([^"']*)["']/i)).trim()
            const headingTitle = decodeAndClean(extractText(cardHtml, /<h1[^>]*>([\s\S]*?)<\/h1>/i))
            const title = headingTitle || imageTitle || mangaId
            const mangaHrefPattern = escapeRegex(`/manga/${mangaId}/`)
            const chapterRegex = new RegExp(`<a[^>]*href=["'][^"']*${mangaHrefPattern}chapter-[^"']+["'][^>]*>([\\s\\S]*?)<\\/a>`, 'i')
            const chapterHtml = extractText(cardHtml, chapterRegex)
            const subtitle = decodeAndClean(extractText(chapterHtml, /<p[^>]*>([\s\S]*?)<\/p>/i)) || decodeAndClean(chapterHtml)

            seen.add(mangaId)
            results.push(App.createPartialSourceManga({
                mangaId,
                image: normalizeUrl(image),
                title,
                subtitle
            }))
        }

        return results
    }

    const linkMatches = html.matchAll(/<a[^>]*href=["'](?:https?:\/\/[^"']+)?\/manga\/([^/"']+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi)
    for (const match of linkMatches) {
        const mangaId = String(match[1] ?? '').trim()
        const anchorHtml = String(match[2] ?? '')
        if (!mangaId || seen.has(mangaId) || !/<img\b/i.test(anchorHtml)) continue

        let image = extractText(anchorHtml, /<img[^>]*src=["']([^"']+)["']/i)
        let title = decodeHTMLEntity(extractText(anchorHtml, /<img[^>]*alt=["']([^"']*)["']/i)).trim()

        const fullMatch = String(match[0] ?? '')
        const position = html.indexOf(fullMatch)
        const nearbyContext = position >= 0
            ? html.substring(Math.max(0, position - 1200), Math.min(html.length, position + fullMatch.length + 1800))
            : anchorHtml

        const mangaHrefPattern = escapeRegex(`/manga/${mangaId}/`)
        const titleRegex = new RegExp(`<a[^>]*href=["'][^"']*${mangaHrefPattern}[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>`, 'ig')
        let titleMatch: RegExpExecArray | null
        while ((titleMatch = titleRegex.exec(nearbyContext)) !== null) {
            const candidate = decodeAndClean(titleMatch[1] ?? '')
            if (candidate && !candidate.toLowerCase().startsWith('chapter ')) {
                title = candidate
                break
            }
        }

        const subtitle = decodeAndClean(extractText(nearbyContext, /<a[^>]*href=["'][^"']*\/chapter-[^"']+["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i))
        if (!image) continue

        seen.add(mangaId)
        results.push(App.createPartialSourceManga({
            mangaId,
            image: normalizeUrl(image),
            title: title || mangaId,
            subtitle
        }))
    }

    return results
}

export const parseSearchTags = (html: string): TagSection[] => {
    const genres: Tag[] = []
    const types: Tag[] = []
    const statuses: Tag[] = []

    const start = html.indexOf('var searchTerms = ')
    const end = start >= 0 ? html.indexOf('};', start) : -1
    if (start >= 0 && end > start) {
        try {
            const rawJson = html.slice(start + 'var searchTerms = '.length, end + 1)
            const searchTerms = JSON.parse(rawJson)
            const rawGenres = Array.isArray(searchTerms?.genre) ? searchTerms.genre : []
            const rawTypes = Array.isArray(searchTerms?.type) ? searchTerms.type : []
            const rawStatuses = Array.isArray(searchTerms?.status) ? searchTerms.status : []

            for (const genre of rawGenres) {
                const slug = String(genre?.slug ?? '').trim()
                const label = String(genre?.name ?? '').trim()
                if (slug && label) genres.push({ id: `genre:${slug}`, label: decodeHTMLEntity(label) })
            }

            for (const type of rawTypes) {
                const slug = String(type?.slug ?? '').trim()
                const label = String(type?.name ?? '').trim()
                if (slug && label) types.push({ id: `type:${slug}`, label: decodeHTMLEntity(label) })
            }

            for (const status of rawStatuses) {
                const slug = String(status?.slug ?? '').trim()
                const label = String(status?.name ?? '').trim()
                if (slug && label) statuses.push({ id: `status:${slug}`, label: decodeHTMLEntity(label) })
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

    if (types.length === 0) {
        types.push(
            { id: 'type:manga', label: 'Manga' },
            { id: 'type:manhwa', label: 'Manhwa' },
            { id: 'type:manhua', label: 'Manhua' }
        )
    }

    if (statuses.length === 0) {
        statuses.push(
            { id: 'status:ongoing', label: 'Ongoing' },
            { id: 'status:completed', label: 'Completed' },
            { id: 'status:on-hiatus', label: 'On Hiatus' }
        )
    }

    const sections: TagSection[] = []
    if (genres.length > 0) sections.push(App.createTagSection({ id: 'genre', label: 'Genres', tags: genres.map((tag) => App.createTag(tag)) }))
    if (types.length > 0) sections.push(App.createTagSection({ id: 'type', label: 'Type', tags: types.map((tag) => App.createTag(tag)) }))
    if (statuses.length > 0) sections.push(App.createTagSection({ id: 'status', label: 'Status', tags: statuses.map((tag) => App.createTag(tag)) }))

    return sections
}
