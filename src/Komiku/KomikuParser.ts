import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { cleanText, decodeHTMLEntity, parseStatus, convertRelativeDate, BASE_URL } from './KomikuHelper'

// ─── Helpers ────────────────────────────────────────────────────────────────

const extractText = (html: string, regex: RegExp): string =>
    (html.match(regex)?.[1] ?? '').trim()

const extractAll = (html: string, regex: RegExp): RegExpMatchArray[] =>
    Array.from(html.matchAll(regex))

// ─── Manga List (used by homepage + view more + search) ─────────────────────

export const parseMangaList = (html: string): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []
    const seen = new Set<string>()

    // Each card: <div class="bge">...</div>
    const cardRegex = /<div class="bge">([\s\S]*?)(?=<div class="bge">|$)/gi
    const cards = extractAll(html, cardRegex)

    for (const card of cards) {
        const cardHtml = card[1] ?? ''

        // href="/manga/slug/" or full URL
        const hrefMatch = cardHtml.match(/href=["'](?:https?:\/\/komiku\.org)?\/manga\/([^/"']+)\/?["']/)
        const mangaId = hrefMatch?.[1]?.trim()
        if (!mangaId || seen.has(mangaId)) continue
        let image = extractText(cardHtml, /data-src=["']([^"']+)["']/)
        if (!image) image = extractText(cardHtml, /<img[^>]*src=["']([^"']+)["']/)

        // Title from <h3>
        const title = cleanText(extractText(cardHtml, /<h3[^>]*>([\s\S]*?)<\/h3>/i)) || mangaId

        // Latest chapter subtitle
        const latestChap = cleanText(extractText(cardHtml, /Terbaru:.*?<span>([\s\S]*?)<\/span>/i))
        const subtitle = latestChap ? `Ch. ${latestChap.replace(/Chapter\s*/i, '')}` : ''

        seen.add(mangaId)
        results.push(App.createPartialSourceManga({
            mangaId,
            image: image || '',
            title,
            subtitle
        }))
    }

    return results
}

// ─── Manga Details ───────────────────────────────────────────────────────────

export const parseMangaDetails = (html: string, mangaId: string): SourceManga => {
    // Title from <h1 itemprop="name">
    const title = cleanText(extractText(html, /<h1[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/i))
        || cleanText(extractText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i))

    // Cover from og:image meta
    let image = extractText(html, /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    if (!image) image = extractText(html, /<img[^>]*class=["'][^"']*thumbnail[^"']*["'][^>]*src=["']([^"']+)["']/i)

    // Status
    const statusRaw = cleanText(extractText(html, /Status[^<]*<\/[^>]+>\s*<[^>]+>([^<]+)/i))
    const status = parseStatus(statusRaw)

    // Author
    const author = cleanText(extractText(html, /Pengarang[^<]*<\/[^>]+>\s*<[^>]+>([^<]+)/i)) || 'Unknown'

    // Description from <p> inside sinopsis section
    const desc = cleanText(extractText(html, /<section[^>]*id=["']Sinopsis["'][^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i))

    // Genres from <a href="/genre/slug/">
    const genreMatches = extractAll(html, /<a[^>]*href=["'][^"']*\/genre\/([^/"']+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi)
    const tags: Tag[] = []
    const seenGenres = new Set<string>()
    for (const m of genreMatches) {
        const id = (m[1] ?? '').trim()
        const label = cleanText(m[2] ?? '')
        if (id && label && !seenGenres.has(id)) {
            seenGenres.add(id)
            tags.push(App.createTag({ id, label }))
        }
    }

    const tagSections: TagSection[] = tags.length > 0
        ? [App.createTagSection({ id: 'genres', label: 'Genres', tags })]
        : []

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles: [title],
            image,
            status,
            author,
            artist: author,
            desc,
            tags: tagSections
        })
    })
}

// ─── Chapter List ────────────────────────────────────────────────────────────

export const parseChapterList = (html: string, mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    let sortingIndex = 0

    // Rows: <tr data-ch="235">
    const rowRegex = /<tr[^>]*data-ch=["']([^"']+)["'][^>]*>([\s\S]*?)<\/tr>/gi
    const rows = extractAll(html, rowRegex)

    for (const row of rows) {
        const chapNum = parseFloat(row[1] ?? '0') || 0
        const rowHtml = row[2] ?? ''

        // href="/manga-slug-chapter-N/" — relative URL
        const hrefMatch = rowHtml.match(/href=["']\/([^"']+chapter[^"']+)\/?["']/i)
        if (!hrefMatch) continue

        // chapterId = the slug after the last slash, e.g. "the-beginning-after-the-end-chapter-235"
        const chapterId = (hrefMatch[1] ?? '').replace(/\/$/, '')

        const titleRaw = cleanText(extractText(rowHtml, /<b>([\s\S]*?)<\/b>/i))
        const name = titleRaw || `Chapter ${chapNum}`

        const dateRaw = cleanText(extractText(rowHtml, /<td[^>]*class=["']tanggalseries["'][^>]*>([\s\S]*?)<\/td>/i))
        const time = convertRelativeDate(dateRaw)

        chapters.push(App.createChapter({
            id: chapterId,
            chapNum,
            name,
            time,
            langCode: '🇮🇩',
            sortingIndex: sortingIndex--
        }))
    }

    return chapters
}

// ─── Chapter Details (images) ────────────────────────────────────────────────

export const parseChapterDetails = (html: string, mangaId: string, chapterId: string): ChapterDetails => {
    const pages: string[] = []

    // Images inside #Baca_Komik with class "ww"
    const imgRegex = /<img[^>]*class=["'][^"']*\bww\b[^"']*["'][^>]*src=["']([^"']+)["']/gi
    const imgs = extractAll(html, imgRegex)

    for (const m of imgs) {
        const src = (m[1] ?? '').trim()
        if (src && !src.includes('data:image') && !src.includes('lazy.jpg')) {
            pages.push(src)
        }
    }

    // Fallback: parse chapterData JS object for image count + construct URLs
    if (pages.length === 0) {
        const chapterDataMatch = html.match(/var chapterData\s*=\s*(\{[\s\S]*?\});/)
        if (chapterDataMatch) {
            try {
                const chapterData = JSON.parse((chapterDataMatch[1] ?? '').replace(/\\\//g, '/'))
                const count: number = chapterData.jumlahgambar ?? 0
                const link: string = chapterData.link ?? ''
                // Images follow pattern: https://img.komiku.org/upload5/{series}/{ch}/{date}/{n}.webp
                // We can't reconstruct without date, so just note it failed
                if (count === 0) throw new Error('No images found')
            } catch {
                // ignore
            }
        }
    }

    if (pages.length === 0) {
        throw new Error(`No pages found for chapter ${chapterId}`)
    }

    return App.createChapterDetails({ id: chapterId, mangaId, pages })
}

// ─── Search Tags ─────────────────────────────────────────────────────────────

export const parseSearchTags = (): TagSection[] => {
    // Hardcoded from FILTER.html — genre list is static
    const genres: Tag[] = [
        { id: 'action', label: 'Action' },
        { id: 'adventure', label: 'Adventure' },
        { id: 'comedy', label: 'Comedy' },
        { id: 'demons', label: 'Demons' },
        { id: 'drama', label: 'Drama' },
        { id: 'ecchi', label: 'Ecchi' },
        { id: 'fantasy', label: 'Fantasy' },
        { id: 'gender-bender', label: 'Gender Bender' },
        { id: 'gore', label: 'Gore' },
        { id: 'harem', label: 'Harem' },
        { id: 'historical', label: 'Historical' },
        { id: 'horror', label: 'Horror' },
        { id: 'isekai', label: 'Isekai' },
        { id: 'josei', label: 'Josei' },
        { id: 'magic', label: 'Magic' },
        { id: 'martial-arts', label: 'Martial Arts' },
        { id: 'mature', label: 'Mature' },
        { id: 'mecha', label: 'Mecha' },
        { id: 'military', label: 'Military' },
        { id: 'mystery', label: 'Mystery' },
        { id: 'psychological', label: 'Psychological' },
        { id: 'regression', label: 'Regression' },
        { id: 'reincarnation', label: 'Reincarnation' },
        { id: 'romance', label: 'Romance' },
        { id: 'school-life', label: 'School Life' },
        { id: 'sci-fi', label: 'Sci-fi' },
        { id: 'seinen', label: 'Seinen' },
        { id: 'shoujo', label: 'Shoujo' },
        { id: 'shoujo-ai', label: 'Shoujo Ai' },
        { id: 'shounen', label: 'Shounen' },
        { id: 'shounen-ai', label: 'Shounen Ai' },
        { id: 'slice-of-life', label: 'Slice of Life' },
        { id: 'sports', label: 'Sports' },
        { id: 'supernatural', label: 'Supernatural' },
        { id: 'thriller', label: 'Thriller' },
        { id: 'tragedy', label: 'Tragedy' },
        { id: 'villainess', label: 'Villainess' },
        { id: 'yuri', label: 'Yuri' },
    ]

    const types: Tag[] = [
        { id: 'manga', label: 'Manga' },
        { id: 'manhwa', label: 'Manhwa' },
        { id: 'manhua', label: 'Manhua' },
    ]

    const statuses: Tag[] = [
        { id: 'ongoing', label: 'Ongoing' },
        { id: 'end', label: 'Tamat' },
    ]

    const orderBys: Tag[] = [
        { id: 'modified', label: 'Chapter Terbaru' },
        { id: 'date', label: 'Komik Terbaru' },
        { id: 'meta_value_num', label: 'Peringkat' },
    ]

    return [
        App.createTagSection({ id: 'genre', label: 'Genre', tags: genres.map(t => App.createTag(t)) }),
        App.createTagSection({ id: 'type', label: 'Type', tags: types.map(t => App.createTag(t)) }),
        App.createTagSection({ id: 'status', label: 'Status', tags: statuses.map(t => App.createTag(t)) }),
        App.createTagSection({ id: 'orderby', label: 'Sort By', tags: orderBys.map(t => App.createTag(t)) }),
    ]
}
