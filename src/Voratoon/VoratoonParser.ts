import {
    Chapter,
    ChapterDetails,
    PartialSourceManga,
    SourceManga,
    Tag,
    TagSection
} from '@paperback/types'

import {
    parseDate,
    parseStatus,
    stripHtml
} from './VoratoonHelper'

export const parseMangaDetails = (data: any, mangaId: string): SourceManga => {
    const mangaData = data?.data ?? {}

    const titles: string[] = []
    if (mangaData.title) titles.push(mangaData.title)
    // nativeTitle is a comma separated alias list; "Field Kosong" is the site's empty placeholder
    for (const alt of String(mangaData.nativeTitle ?? '').split(',')) {
        const title = alt.trim()
        if (title && title.toLowerCase() !== 'field kosong' && !titles.includes(title)) {
            titles.push(title)
        }
    }
    if (titles.length === 0) titles.push(mangaId)

    const genreTags: Tag[] = (mangaData.genres ?? [])
        .map((genre: any) => String(genre?.data?.name ?? '').trim())
        .filter((name: string) => name)
        .map((name: string) => App.createTag({ id: name, label: name }))

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image: mangaData.coverImage || '',
            status: parseStatus(mangaData.status),
            author: mangaData.author || 'Unknown',
            artist: mangaData.author || 'Unknown',
            desc: stripHtml(mangaData.synopsis || ''),
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

export const parseChapterList = (data: any[], mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    let sortingIndex = 0

    for (const chapter of data ?? []) {
        const chapterData = chapter?.data ?? {}
        // The chapter endpoint is addressed by index, not by the numeric chapter id
        const index = chapterData.index
        if (index === undefined || index === null) continue

        chapters.push(App.createChapter({
            id: String(index),
            chapNum: Number(index) || 0,
            name: chapterData.title || `Chapter ${index}`,
            time: parseDate(chapter?.createdAt),
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
    const pages: string[] = (data?.data?.images ?? []).filter((page: any) => typeof page === 'string' && page)

    if (pages.length === 0) {
        throw new Error(`Failed to find any pages for chapter ${chapterId} of manga ${mangaId}`)
    }

    return App.createChapterDetails({
        id: chapterId,
        mangaId,
        pages
    })
}

export const parseMangaList = (data: any[]): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []

    for (const item of data ?? []) {
        const mangaData = item?.data ?? {}
        const mangaId = mangaData.slug || String(item?.id ?? '')
        if (!mangaId) continue

        const latestChapter = (item?.chapters ?? [])[0]?.data?.index
        const rating = Number(mangaData.rating ?? 0)

        const parts: string[] = []
        if (latestChapter !== undefined && latestChapter !== null) parts.push(`Ch. ${latestChapter}`)
        else if (mangaData.totalChapters) parts.push(`Ch. ${mangaData.totalChapters}`)
        if (rating > 0) parts.push(`★ ${rating}`)

        results.push(App.createPartialSourceManga({
            mangaId,
            image: mangaData.coverImage || '',
            title: mangaData.title || mangaId,
            subtitle: parts.join(' • ')
        }))
    }

    return results
}

export const parseSearchTags = (data: any[]): TagSection[] => {
    const genres: Tag[] = []
    for (const genre of data ?? []) {
        const name = String(genre?.data?.name ?? '').trim()
        const id = genre?.id
        // The API filters on numeric genre ids (`filter=genreIds=in=(3)`); names are ignored
        if (!name || id === undefined || id === null) continue
        genres.push(App.createTag({ id: `genre:${id}`, label: name }))
    }

    const tagSections: TagSection[] = []

    if (genres.length > 0) {
        tagSections.push(App.createTagSection({
            id: 'genres',
            label: 'Genres',
            tags: genres
        }))
    }

    tagSections.push(App.createTagSection({
        id: 'status',
        label: 'Status',
        tags: [
            { id: 'status:ongoing', label: 'Ongoing' },
            { id: 'status:completed', label: 'Completed' },
            { id: 'status:hiatus', label: 'Hiatus' },
            { id: 'status:cancelled', label: 'Cancelled' }
        ].map(tag => App.createTag(tag))
    }))

    tagSections.push(App.createTagSection({
        id: 'format',
        label: 'Format',
        tags: [
            { id: 'format:manga', label: 'Manga' },
            { id: 'format:manhwa', label: 'Manhwa' },
            { id: 'format:manhua', label: 'Manhua' }
        ].map(tag => App.createTag(tag))
    }))

    return tagSections
}
