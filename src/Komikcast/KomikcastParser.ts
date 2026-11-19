import {
    Chapter,
    ChapterDetails,
    PartialSourceManga,
    SourceManga,
    Tag,
    TagSection
} from '@paperback/types'
import { normalizeUrl, parseDate, parseStatus, stripHtml } from './KomikcastHelper'

export const parseMangaList = (items: any[]): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []
    const seen: Record<string, boolean> = {}

    for (const item of items ?? []) {
        const slug = String(item?.slug ?? '').trim()
        const title = String(item?.title ?? '').trim()
        if (!slug || !title || seen[slug]) continue
        seen[slug] = true

        const parts: string[] = []
        const lastCh = item?.last_chapter?.chapter_number
            ?? item?.latest_chapter?.chapter_number
            ?? item?.chapters?.[0]?.chapter_number
            ?? item?.last_chapter_number
        if (lastCh !== undefined && lastCh !== null && lastCh !== '') {
            parts.push(`Ch. ${lastCh}`)
        }
        const rating = Number(item?.rating ?? 0)
        if (rating > 0) parts.push(`★ ${rating}`)

        results.push(App.createPartialSourceManga({
            mangaId: slug,
            image: normalizeUrl(item?.poster || item?.cover || ''),
            title,
            subtitle: parts.join(' • ')
        }))
    }

    return results
}

export const parseMangaDetails = (manga: any, mangaId: string): SourceManga => {
    const titles: string[] = []
    if (manga?.title) titles.push(String(manga.title).trim())
    const altRaw = manga?.alternative_titles
    if (Array.isArray(altRaw)) {
        for (const a of altRaw) {
            const clean = String(a ?? '').trim()
            if (clean && !titles.includes(clean)) titles.push(clean)
        }
    } else if (typeof altRaw === 'string' && altRaw.trim()) {
        for (const a of altRaw.split(/[,;/]/)) {
            const clean = a.trim()
            if (clean && !titles.includes(clean)) titles.push(clean)
        }
    }
    if (titles.length === 0) titles.push(mangaId)

    const authorRaw = String(manga?.author ?? '').trim()
    const artistRaw = String(manga?.artist ?? '').trim()
    const author = authorRaw && authorRaw !== '-' ? authorRaw : 'Unknown'
    const artist = artistRaw && artistRaw !== '-' ? artistRaw : author

    const genreTags: Tag[] = (Array.isArray(manga?.genres) ? manga.genres : [])
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
            image: normalizeUrl(manga?.poster || manga?.cover || ''),
            status: parseStatus(manga?.status),
            author,
            artist,
            desc: stripHtml(manga?.synopsis ?? ''),
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
        const num = ch?.chapter_number
        if (num === undefined || num === null || num === '') continue
        const id = String(num)
        if (seen[id]) continue
        seen[id] = true

        const chapNum = parseFloat(id)
        chapters.push(App.createChapter({
            id,
            chapNum: isNaN(chapNum) ? 0 : chapNum,
            name: String(ch?.title ?? '').trim() || `Chapter ${id}`,
            time: parseDate(ch?.created_at || ch?.updated_at || ''),
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

export const parseChapterDetails = (chapter: any, mangaId: string, chapterId: string): ChapterDetails => {
    const rawImages = Array.isArray(chapter?.images) ? chapter.images.slice() : []
    rawImages.sort((a: any, b: any) => Number(a?.order ?? 0) - Number(b?.order ?? 0))

    const pages: string[] = rawImages
        .map((img: any) => normalizeUrl(img?.r2_url || img?.image_path || img?.url || ''))
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
    const genreTags: Tag[] = (genresRaw ?? [])
        .map((g: any) => ({
            id: g?.slug ? `genre:${g.slug}` : '',
            label: String(g?.name ?? '').trim()
        }))
        .filter((t: Tag) => t.id.length > 0 && t.label.length > 0)
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
            { id: 'type:Manga', label: 'Manga' },
            { id: 'type:Manhwa', label: 'Manhwa' },
            { id: 'type:Manhua', label: 'Manhua' }
        ].map(t => App.createTag(t))
    }))

    sections.push(App.createTagSection({
        id: 'status',
        label: 'Status',
        tags: [
            { id: 'status:Ongoing', label: 'Ongoing' },
            { id: 'status:Completed', label: 'Completed' },
            { id: 'status:Hiatus', label: 'Hiatus' }
        ].map(t => App.createTag(t))
    }))

    sections.push(App.createTagSection({
        id: 'sort',
        label: 'Sort By',
        tags: [
            { id: 'sort:latest', label: 'Latest Update' },
            { id: 'sort:popular', label: 'Popular' }
        ].map(t => App.createTag(t))
    }))

    return sections
}
