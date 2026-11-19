import {
    Chapter,
    ChapterDetails,
    PartialSourceManga,
    SourceManga,
    Tag,
    TagSection
} from '@paperback/types'
import { BASE_URL, normalizeUrl, parseDate, parseStatus, stripHtml } from './AinzScanHelper'

export const parseMangaList = (items: any[], baseUrl: string = BASE_URL): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []
    const seen: Record<string, boolean> = {}

    for (const item of items ?? []) {
        const slug = String(item?.slug ?? '').trim()
        const title = String(item?.title ?? '').trim()
        if (!slug || !title || seen[slug]) continue
        seen[slug] = true

        const parts: string[] = []
        const latestCh = item?.latest_unit?.number ?? item?.latest_chapter?.number ?? item?.latest_chapter_number
        if (latestCh !== undefined && latestCh !== null && latestCh !== '') {
            const num = parseFloat(String(latestCh))
            parts.push(`Ch. ${isNaN(num) ? latestCh : num}`)
        }
        const rating = Number(item?.rating_average ?? 0)
        if (rating > 0) parts.push(`★ ${rating.toFixed(1)}`)

        results.push(App.createPartialSourceManga({
            mangaId: slug,
            image: normalizeUrl(item?.poster_image_url || item?.cover_image_url || item?.banner_image_url || '', baseUrl),
            title,
            subtitle: parts.join(' • ')
        }))
    }

    return results
}

export const parseMangaDetails = (series: any, mangaId: string, baseUrl: string = BASE_URL): SourceManga => {
    const titles: string[] = []
    if (series?.title) titles.push(String(series.title).trim())
    const altRaw = series?.alternative_titles
    if (Array.isArray(altRaw)) {
        for (const a of altRaw) {
            const clean = String(a ?? '').trim()
            if (clean && !titles.includes(clean)) titles.push(clean)
        }
    } else if (typeof altRaw === 'string' && altRaw.trim()) {
        for (const a of altRaw.split(/[,;/|]/)) {
            const clean = a.trim()
            if (clean && !titles.includes(clean)) titles.push(clean)
        }
    }
    if (titles.length === 0) titles.push(mangaId)

    const authorRaw = String(series?.author_name ?? series?.author ?? '').trim()
    const artistRaw = String(series?.artist_name ?? series?.artist ?? '').trim()
    const author = authorRaw && authorRaw !== '-' ? authorRaw : 'Unknown'
    const artist = artistRaw && artistRaw !== '-' ? artistRaw : author

    const genreTags: Tag[] = (Array.isArray(series?.genres) ? series.genres : [])
        .map((g: any) => ({
            id: g?.slug ? `genre:${g.slug}` : '',
            label: String(g?.name ?? '').trim()
        }))
        .filter((t: Tag) => t.id.length > 0 && t.label.length > 0)
        .map((t: Tag) => App.createTag(t))

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image: normalizeUrl(series?.poster_image_url || series?.cover_image_url || '', baseUrl),
            status: parseStatus(series?.comic_status || series?.series_status || series?.status || ''),
            author,
            artist,
            desc: stripHtml(series?.synopsis ?? ''),
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

export const parseChapterList = (units: any[], mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    const seen: Record<string, boolean> = {}
    let sortingIndex = 0

    for (const unit of units ?? []) {
        const slug = String(unit?.slug ?? '').trim()
        if (!slug || seen[slug]) continue
        seen[slug] = true

        const rawNum = unit?.sort_number ?? unit?.number ?? '0'
        const chapNum = parseFloat(String(rawNum))
        const title = String(unit?.title ?? '').trim() || `Chapter ${isNaN(chapNum) ? rawNum : chapNum}`

        chapters.push(App.createChapter({
            id: slug,
            chapNum: isNaN(chapNum) ? 0 : chapNum,
            name: unit?.is_locked ? `🔒 ${title}` : title,
            time: parseDate(unit?.created_at || unit?.updated_at || ''),
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

export const parseChapterDetails = (data: any, mangaId: string, chapterId: string, baseUrl: string = BASE_URL): ChapterDetails => {
    const rawPages = Array.isArray(data?.chapter?.pages)
        ? data.chapter.pages.slice()
        : (Array.isArray(data?.pages) ? data.pages.slice() : [])

    rawPages.sort((a: any, b: any) => Number(a?.page_number ?? 0) - Number(b?.page_number ?? 0))

    const pages: string[] = rawPages
        .map((p: any) => normalizeUrl(typeof p === 'string' ? p : (p?.image_url || p?.url || ''), baseUrl))
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

export const parseSearchTags = (genresRaw: any[]): TagSection[] => {
    const genreTags: Tag[] = (Array.isArray(genresRaw) ? genresRaw : [])
        .map((g: any) => ({
            id: g?.slug ? `genre:${g.slug}` : '',
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
        id: 'status',
        label: 'Status',
        tags: [
            { id: 'status:ONGOING', label: 'Ongoing' },
            { id: 'status:COMPLETED', label: 'Completed' },
            { id: 'status:HIATUS', label: 'Hiatus' }
        ].map(t => App.createTag(t))
    }))

    sections.push(App.createTagSection({
        id: 'sort',
        label: 'Sort By',
        tags: [
            { id: 'sort:latest', label: 'Latest Update' },
            { id: 'sort:popular', label: 'Popular' },
            { id: 'sort:az', label: 'A-Z' }
        ].map(t => App.createTag(t))
    }))

    return sections
}
