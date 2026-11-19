import {
    Chapter,
    ChapterDetails,
    PartialSourceManga,
    SourceManga,
    Tag,
    TagSection
} from '@paperback/types'
import { normalizeUrl, parseDate, parseStatus, stripHtml, WEBSITE_BASE } from './IkiruHelper'

export const parseMangaList = (items: any[], baseUrl: string = WEBSITE_BASE): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []
    const seen: Record<string, boolean> = {}

    for (const raw of items ?? []) {
        // `/api/public/manga/featured` wraps the manga object under `.manga`
        const item = raw?.manga && typeof raw.manga === 'object' ? raw.manga : raw
        if (!item) continue

        // Skip text-only novels in manga reader
        if (String(item.type ?? '').toUpperCase() === 'NOVEL') continue

        const slug = String(item.slug ?? '').trim()
        const title = String(item.title ?? '').trim()
        if (!slug || !title || seen[slug]) continue
        seen[slug] = true

        const image = normalizeUrl(item.featuredImage || item.cover || '', baseUrl)

        const parts: string[] = []
        const latestCh = item.latestChapter?.number ?? item.lastChapter?.number ?? item.chapter?.[0]?.number ?? item.chapters?.[0]?.number
        if (latestCh !== undefined && latestCh !== null && latestCh !== '') {
            parts.push(`Ch. ${latestCh}`)
        } else if (item.chaptersCount) {
            parts.push(`${item.chaptersCount} Ch`)
        }
        const score = Number(raw?.score ?? item.metadata?.score ?? 0)
        if (score > 0) parts.push(`★ ${score}`)

        results.push(App.createPartialSourceManga({
            mangaId: slug,
            image,
            title,
            subtitle: parts.join(' • ')
        }))
    }

    return results
}

export const parseMangaDetails = (data: any, mangaId: string, baseUrl: string = WEBSITE_BASE): SourceManga => {
    const meta = data?.metadata ?? {}
    const titles: string[] = []
    if (data?.title) titles.push(String(data.title).trim())
    if (Array.isArray(meta.alternateTitles)) {
        for (const alt of meta.alternateTitles) {
            const clean = String(alt ?? '').trim()
            if (clean && !titles.includes(clean)) titles.push(clean)
        }
    }
    if (titles.length === 0) titles.push(mangaId)

    const authors = (Array.isArray(meta.author) ? meta.author : [])
        .map((a: any) => String(a?.name ?? '').trim())
        .filter((x: string) => x.length > 0)
    const artists = (Array.isArray(meta.artist) ? meta.artist : [])
        .map((a: any) => String(a?.name ?? '').trim())
        .filter((x: string) => x.length > 0)

    const author = authors.length ? authors.join(', ') : 'Unknown'
    const artist = artists.length ? artists.join(', ') : author

    const genresRaw = Array.isArray(meta.genre) ? meta.genre : (Array.isArray(data?.genre) ? data.genre : [])
    const genreTags: Tag[] = genresRaw
        .map((g: any) => ({
            id: g?.id ? `genre:${g.id}` : `genre:${g?.slug ?? ''}`,
            label: String(g?.name ?? '').trim()
        }))
        .filter((t: Tag) => t.id !== 'genre:' && t.label.length > 0)
        .map((t: Tag) => App.createTag(t))

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image: normalizeUrl(data?.featuredImage || data?.cover || '', baseUrl),
            status: parseStatus(data?.status),
            author,
            artist,
            desc: stripHtml(data?.description ?? ''),
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

export const parseChapterList = (chaptersRaw: any[], mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    const seen: Record<string, boolean> = {}
    let sortingIndex = 0

    for (const ch of chaptersRaw ?? []) {
        const num = ch?.number
        if (num === undefined || num === null || num === '') continue
        const id = String(num)
        if (seen[id]) continue
        seen[id] = true

        const chapNum = parseFloat(id)
        chapters.push(App.createChapter({
            id,
            chapNum: isNaN(chapNum) ? 0 : chapNum,
            name: String(ch?.title ?? '').trim() || `Chapter ${id}`,
            time: parseDate(ch?.createdAt || ch?.updatedAt || ''),
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

export const parseChapterDetails = (data: any, mangaId: string, chapterId: string, baseUrl: string = WEBSITE_BASE): ChapterDetails => {
    const medias = Array.isArray(data?.medias) ? data.medias.slice() : []
    medias.sort((a: any, b: any) => Number(a?.pageNumber ?? 0) - Number(b?.pageNumber ?? 0))

    const pages: string[] = medias
        .map((m: any) => normalizeUrl(m?.filePath || m?.url || '', baseUrl))
        .filter((p: string) => p.length > 0)

    if (pages.length === 0) {
        throw new Error(`Failed to find any pages for chapter ${chapterId} of manga ${mangaId}`)
    }

    return App.createChapterDetails({
        id: chapterId,
        mangaId,
        pages
    })
}

export const parseSearchTags = (allGenres: any[]): TagSection[] => {
    const genreTags: Tag[] = (allGenres ?? [])
        .map((g: any) => ({
            id: g?.id ? `genre:${g.id}` : '',
            label: String(g?.name ?? '').trim()
        }))
        .filter((t: Tag) => t.id.length > 0 && t.label.length > 0)
        .sort((a: Tag, b: Tag) => a.label.localeCompare(b.label))
        .map((t: Tag) => App.createTag(t))

    const sections: TagSection[] = []
    if (genreTags.length > 0) {
        sections.push(App.createTagSection({
            id: 'genres',
            label: 'Genres',
            tags: genreTags
        }))
    }

    sections.push(App.createTagSection({
        id: 'type',
        label: 'Type',
        tags: [
            { id: 'type:MANGA', label: 'Manga' },
            { id: 'type:MANHWA', label: 'Manhwa' },
            { id: 'type:MANHUA', label: 'Manhua' }
        ].map(t => App.createTag(t))
    }))

    sections.push(App.createTagSection({
        id: 'status',
        label: 'Status',
        tags: [
            { id: 'status:ONGOING', label: 'Ongoing' },
            { id: 'status:COMPLETED', label: 'Completed' },
            { id: 'status:HIATUS', label: 'Hiatus' }
        ].map(t => App.createTag(t))
    }))

    return sections
}
