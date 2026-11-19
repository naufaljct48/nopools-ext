import {
    Chapter,
    ChapterDetails,
    PartialSourceManga,
    SourceManga,
    Tag,
    TagSection
} from '@paperback/types'
import { normalizeUrl, parseStatus, parseTimestamp } from './KomikuAsiaHelper'

export const parseMangaList = (items: any[]): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []
    const seen: Record<string, boolean> = {}

    for (const raw of items ?? []) {
        // `/api/v2/comics/latest-updates` wraps each comic under `.comic`
        const comic = raw?.comic && typeof raw.comic === 'object' ? raw.comic : raw
        if (!comic || comic.hidden) continue

        const slug = String(comic.slug ?? '').trim()
        const title = String(comic.title ?? '').trim()
        if (!slug || !title || seen[slug]) continue
        seen[slug] = true

        const parts: string[] = []
        if (comic.latestChapter !== undefined && comic.latestChapter !== null && comic.latestChapter !== '') {
            parts.push(`Ch. ${comic.latestChapter}`)
        } else if (comic.chapterCount) {
            parts.push(`${comic.chapterCount} Ch`)
        }
        const rating = Number(comic.rating ?? 0)
        if (rating > 0) parts.push(`★ ${rating}`)

        results.push(App.createPartialSourceManga({
            mangaId: slug,
            image: normalizeUrl(comic.coverUrl || comic.cover || ''),
            title,
            subtitle: parts.join(' • ')
        }))
    }

    return results
}

export const parseMangaDetails = (comic: any, mangaId: string): SourceManga => {
    const titles: string[] = []
    if (comic?.title) titles.push(String(comic.title).trim())
    const altRaw = String(comic?.alt ?? '').trim()
    if (altRaw) {
        for (const alt of altRaw.split(/[•,;|]/)) {
            const clean = alt.trim()
            if (clean && !titles.includes(clean)) titles.push(clean)
        }
    }
    if (titles.length === 0) titles.push(mangaId)

    const authorRaw = String(comic?.author ?? '').trim()
    const artistRaw = String(comic?.artist ?? '').trim()
    const author = authorRaw && authorRaw !== '-' ? authorRaw : 'Unknown'
    const artist = artistRaw && artistRaw !== '-' ? artistRaw : author

    const genreTags: Tag[] = (Array.isArray(comic?.genres) ? comic.genres : [])
        .map((g: any) => String(g ?? '').trim())
        .filter((g: string) => g.length > 0)
        .map((g: string) => App.createTag({ id: `genre:${g}`, label: g }))

    const desc = String(comic?.synopsis ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image: normalizeUrl(comic?.coverUrl || comic?.cover || ''),
            status: parseStatus(comic?.status),
            author,
            artist,
            desc,
            tags: [
                App.createTagSection({
                    id: 'genres',
                    label: 'Genres',
                    tags: genreTags
                })
            ]
        })
    })
}

export const parseChapterList = (chaptersRaw: any[], comicId: number | string, mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    const seen: Record<string, boolean> = {}
    let sortingIndex = 0

    for (const ch of chaptersRaw ?? []) {
        const chId = ch?.id
        if (chId === undefined || chId === null) continue
        // Encode comicId/chapterId so getChapterDetails works in a single request
        const id = `${comicId}/${chId}`
        if (seen[id]) continue
        seen[id] = true

        const chapNum = Number(ch?.n ?? 0)
        chapters.push(App.createChapter({
            id,
            chapNum: isNaN(chapNum) ? 0 : chapNum,
            name: String(ch?.title ?? '').trim() || `Chapter ${ch?.n ?? ''}`,
            time: parseTimestamp(ch?.releasedAt),
            langCode: '🇮🇩',
            volume: 0,
            group: '',
            sortingIndex: sortingIndex--
        }))
    }

    if (chapters.length === 0) {
        throw new Error(`Couldn't find any chapters for mangaId: ${mangaId}!`)
    }

    return chapters
}

export const parseChapterDetails = (data: any, mangaId: string, chapterId: string): ChapterDetails => {
    const rawPages = Array.isArray(data?.pages) ? data.pages.slice() : []
    rawPages.sort((a: any, b: any) => Number(a?.index ?? 0) - Number(b?.index ?? 0))

    const pages: string[] = rawPages
        .map((p: any) => normalizeUrl(typeof p === 'string' ? p : (p?.url ?? '')))
        .filter((u: string) => u.length > 0)

    if (pages.length === 0) {
        throw new Error(`Failed to find any pages for chapter ${chapterId} of manga ${mangaId}`)
    }

    return App.createChapterDetails({
        id: chapterId,
        mangaId,
        pages
    })
}

export const parseSearchTags = (filters: any): TagSection[] => {
    const sections: TagSection[] = []

    const genres: Tag[] = (Array.isArray(filters?.genres) ? filters.genres : [])
        .map((g: any) => String(g ?? '').trim())
        .filter((g: string) => g.length > 0 && g.toLowerCase() !== 'semua')
        .map((g: string) => App.createTag({ id: `genre:${g}`, label: g }))

    if (genres.length > 0) {
        sections.push(App.createTagSection({
            id: 'genres',
            label: 'Genres',
            tags: genres
        }))
    }

    const types: Tag[] = (Array.isArray(filters?.types) ? filters.types : ['Manga', 'Manhwa', 'Manhua'])
        .map((t: any) => String(t ?? '').trim())
        .filter((t: string) => t.length > 0 && t.toLowerCase() !== 'semua')
        .map((t: string) => App.createTag({ id: `type:${t}`, label: t }))

    if (types.length > 0) {
        sections.push(App.createTagSection({
            id: 'type',
            label: 'Type',
            tags: types
        }))
    }

    const statuses: Tag[] = (Array.isArray(filters?.statuses) ? filters.statuses : ['Ongoing', 'Completed', 'Hiatus'])
        .map((s: any) => String(s ?? '').trim())
        .filter((s: string) => s.length > 0 && s.toLowerCase() !== 'semua')
        .map((s: string) => App.createTag({ id: `status:${s}`, label: s }))

    if (statuses.length > 0) {
        sections.push(App.createTagSection({
            id: 'status',
            label: 'Status',
            tags: statuses
        }))
    }

    return sections
}
