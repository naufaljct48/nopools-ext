import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { cleanText, convertTime, decodeBase64, decodeHTMLEntity, escapeRegex, normalizeUrl } from './LumosKomikHelper'

const extractText = (html: string, regex: RegExp): string => html.match(regex)?.[1]?.trim() ?? ''

// Only anchors carrying a card class are real entries: /browse ships hidden
// honeypot links (/comic/honeypot-trap-*) that would otherwise be scraped.
const CARD_LINK = /<a[^>]*href="(?:https?:\/\/[^"]+)?\/comic\/([^"/?#]+)"[^>]*class="[^"]*(?:htg-card-cover|lcard-cover|pg-link)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
const ANY_LINK = /<a[^>]*href="(?:https?:\/\/[^"]+)?\/comic\/([^"/?#]+)"[^>]*>([\s\S]*?)<\/a>/gi

const parseSubtitle = (window: string): string => {
    // Homepage cards list their newest chapters, browse cards list a chapter count
    const chapter = extractText(window, /class="lcard-ch-num"[^>]*>([\s\S]*?)<\/span>/i)
    if (chapter) return cleanText(chapter)

    const count = extractText(window, />\s*(\d+)\s*<span[^>]*>\s*Chs?\./i)
    return count ? `${count} Chapters` : ''
}

export const parseMangaList = (html: string): PartialSourceManga[] => {
    const entries = new Map<string, { image: string, title: string, subtitle: string }>()

    const collect = (pattern: RegExp): void => {
        for (const match of html.matchAll(pattern)) {
            const mangaId = String(match[1] ?? '').trim()
            const content = String(match[2] ?? '')
            if (!mangaId || mangaId.includes('honeypot')) continue

            const entry = entries.get(mangaId) ?? { image: '', title: '', subtitle: '' }
            if (!entry.image) entry.image = normalizeUrl(extractText(content, /<img[^>]*src="([^"]+)"/i))
            if (!entry.title) {
                entry.title = decodeHTMLEntity(extractText(content, /<img[^>]*alt="([^"]*)"/i)) ||
                    decodeHTMLEntity(extractText(match[0] ?? '', /title="([^"]*)"/i)) ||
                    cleanText(content)
            }
            if (!entry.subtitle) {
                const end = (match.index ?? 0) + String(match[0] ?? '').length
                entry.subtitle = parseSubtitle(html.slice(end, end + 800))
            }

            entries.set(mangaId, entry)
        }
    }

    collect(CARD_LINK)
    if (entries.size === 0) collect(ANY_LINK)

    const results: PartialSourceManga[] = []
    for (const [mangaId, entry] of entries) {
        results.push(App.createPartialSourceManga({
            mangaId,
            image: entry.image,
            title: entry.title || mangaId,
            subtitle: entry.subtitle
        }))
    }

    return results
}

// Home sections live in named containers on the landing page
export const sliceSection = (html: string, containerId: string): string => {
    const start = html.indexOf(`id="${containerId}"`)
    if (start < 0) return ''

    const end = html.indexOf('</section>', start)
    return html.slice(start, end < 0 ? undefined : end)
}

export const parseTotalResults = (html: string): number =>
    parseInt(extractText(html, /rounded-md">(\d+)<\/span>/i) || '0')

export const parseMangaDetails = (html: string, mangaId: string): SourceManga => {
    const series = parseLinkedData(html)

    // The localised title only exists in the markup, right below the heading
    const localTitle = cleanText(extractText(html, /<h1[^>]*>[\s\S]*?<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/i))

    const titles: string[] = []
    for (const title of [series.name, series.alternateName, localTitle]) {
        const clean = decodeHTMLEntity(String(title ?? '')).trim()
        if (clean && !titles.includes(clean)) titles.push(clean)
    }
    if (titles.length === 0) titles.push(cleanText(extractText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)) || mangaId)

    const image = normalizeUrl(String(series.image ?? '') ||
        extractText(html, new RegExp(`<img[^>]*src="([^"]*\\/comic\\/${escapeRegex(mangaId)}\\/cover[^"]*)"`, 'i')))

    const author = decodeHTMLEntity(String(series.author?.name ?? '')).trim() ||
        cleanText(extractText(html, />\s*Author\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i)) ||
        'Unknown'

    const tags: Tag[] = []
    for (const match of html.matchAll(/<a[^>]*href="[^"]*\/browse\?genre=([^"&]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const id = String(match[1] ?? '').trim()
        const label = cleanText(String(match[2] ?? ''))
        if (id && label && !tags.some((tag) => tag.id === `genre:${id}`)) tags.push({ id: `genre:${id}`, label })
    }

    const desc = decodeBase64(extractText(html, /id="synopsis-wrapper"[\s\S]{0,600}?data-sr="([^"]*)"/i)) ||
        decodeHTMLEntity(String(series.description ?? '')) ||
        decodeHTMLEntity(extractText(html, /<meta[^>]*name="description"[^>]*content="([^"]*)"/i))

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image,
            status: parseStatus(html),
            author,
            artist: author,
            desc: desc.trim(),
            tags: tags.length > 0
                ? [App.createTagSection({ id: 'genres', label: 'Genres', tags: tags.map((tag) => App.createTag(tag)) })]
                : []
        })
    })
}

const parseLinkedData = (html: string): any => {
    const raw = extractText(html, /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i)
    if (!raw) return {}

    try {
        const data = JSON.parse(raw)
        const items: any[] = Array.isArray(data) ? data : [data]
        return items.find((item) => String(item?.['@type'] ?? '').includes('Comic')) ?? {}
    } catch (error) {
        return {}
    }
}

const parseStatus = (html: string): string => {
    const status = extractText(html, />\s*Status\s*<\/div>[\s\S]{0,400}?capitalize[^>]*>\s*([A-Za-z]+)\s*</i).toLowerCase()
    if (status.includes('ongoing') || status.includes('berjalan')) return 'Ongoing'
    if (status.includes('completed') || status.includes('tamat')) return 'Completed'
    if (status.includes('hiatus')) return 'Hiatus'
    return 'Unknown'
}

export const parseChapterList = (html: string, mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    const seen = new Set<string>()
    let sortingIndex = 0

    const pattern = new RegExp(
        `<a[^>]*href="(?:https?://[^"]+)?/read/${escapeRegex(mangaId)}/([^"/?#]+)"[^>]*data-chapter="([^"]*)"[^>]*>([\\s\\S]*?)</a>`,
        'gi'
    )

    for (const match of html.matchAll(pattern)) {
        const chapterId = String(match[1] ?? '').trim()
        if (!chapterId || seen.has(chapterId)) continue
        seen.add(chapterId)

        const content = String(match[3] ?? '')
        const chapNum = parseFloat(String(match[2] ?? '')) || parseFloat(chapterId.replace(/[^\d.]/g, '')) || 0
        const name = cleanText(extractText(content, /<span[^>]*>([\s\S]*?)<\/span>/i)) || `Chapter ${chapNum}`
        const time = extractText(content, /tabular-nums[^>]*>([\s\S]*?)<\/span>/i)

        chapters.push(App.createChapter({
            id: chapterId,
            chapNum,
            name,
            time: convertTime(cleanText(time)),
            langCode: '🇮🇩',
            sortingIndex: sortingIndex--
        }))
    }

    return chapters
}

const collectImages = (html: string, pattern: RegExp): string[] => {
    const sources: string[] = []
    for (const match of html.matchAll(pattern)) {
        const src = String(match[1] ?? '').trim()
        if (src && !src.startsWith('data:')) sources.push(src)
    }
    return sources
}

export const parseChapterDetails = (html: string, mangaId: string, chapterId: string): ChapterDetails => {
    const reader = html.slice(Math.max(0, html.indexOf('id="reader-pages"')))

    // Page images are labelled "Page n"; chapters served from a mirror host keep
    // that label even though their URL no longer matches the chapter directory
    let pages = collectImages(reader, /<img[^>]*src="([^"]+)"[^>]*alt="Page[^"]*"/gi)
    if (pages.length === 0) {
        pages = collectImages(reader, /<img[^>]*src="([^"]+)"/gi)
            .filter((src) => !src.includes('/api/image/p/') && !src.includes('placeholder') && !src.includes('cover_'))
    }

    if (pages.length === 0) {
        throw new Error(`Failed to find any pages for chapter ${chapterId} of manga ${mangaId}`)
    }

    return App.createChapterDetails({
        id: chapterId,
        mangaId,
        pages: pages.map((src) => normalizeUrl(src))
    })
}

export const parseSearchTags = (html: string): TagSection[] => {
    const genres: Tag[] = []
    for (const match of html.matchAll(/<input[^>]*class="bf-genre-cb[^"]*"[^>]*value="([^"]+)"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/gi)) {
        const id = String(match[1] ?? '').trim()
        const label = cleanText(String(match[2] ?? ''))
        if (id && label) genres.push({ id: `genre:${id}`, label })
    }

    const sections: TagSection[] = []
    if (genres.length > 0) {
        sections.push(App.createTagSection({ id: 'genre', label: 'Genres', tags: genres.map((tag) => App.createTag(tag)) }))
    }

    sections.push(App.createTagSection({
        id: 'status',
        label: 'Status',
        tags: [
            { id: 'status:ongoing', label: 'Ongoing' },
            { id: 'status:completed', label: 'Completed' },
            { id: 'status:hiatus', label: 'Hiatus' }
        ].map((tag) => App.createTag(tag))
    }))

    sections.push(App.createTagSection({
        id: 'type',
        label: 'Type',
        tags: [
            { id: 'type:manga', label: 'Manga' },
            { id: 'type:manhwa', label: 'Manhwa' },
            { id: 'type:manhua', label: 'Manhua' }
        ].map((tag) => App.createTag(tag))
    }))

    return sections
}
