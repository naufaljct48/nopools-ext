import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { parseStatus, stripHtml } from './KomiknesiaHelper'

export const parseMangaDetails = (data: any, mangaId: string): SourceManga => {
    const titles = [data.title]
    if (data.alternative_name) {
        titles.push(data.alternative_name)
    }

    const genreTags: Tag[] = (data.genres || []).map((genre: any) => App.createTag({
        id: genre.slug,
        label: genre.name
    }))

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image: data.cover || data.thumbnail || '',
            status: parseStatus(data.status),
            author: data.author || 'Unknown',
            artist: data.author || 'Unknown',
            desc: stripHtml(data.sinopsis || ''),
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

export const parseChapterList = (chapters: any[], mangaId: string): Chapter[] => {
    const result: Chapter[] = []
    let sortingIndex = 0

    for (const chapter of chapters || []) {
        const chapNum = parseFloat(chapter.number) || 0

        result.push(App.createChapter({
            id: chapter.slug,
            chapNum,
            name: chapter.title || `Chapter ${chapter.number}`,
            time: chapter.created_at?.time ? new Date(chapter.created_at.time * 1000) : new Date(),
            langCode: '🇮🇩',
            sortingIndex: sortingIndex--
        }))
    }

    return result
}

export const parseChapterDetails = (data: any, mangaId: string, chapterId: string): ChapterDetails => {
    const pages: string[] = data.images || []

    return App.createChapterDetails({
        id: chapterId,
        mangaId,
        pages
    })
}

export const parseMangaList = (data: any[]): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []

    for (const item of data || []) {
        const lastChapters = item.lastChapters || []
        const latestChapter = lastChapters[0]

        let subtitle = ''
        if (latestChapter?.number) {
            subtitle = `Ch. ${latestChapter.number}`
        }

        results.push(App.createPartialSourceManga({
            mangaId: item.slug,
            image: item.thumbnail || item.cover || '',
            title: item.title || '',
            subtitle
        }))
    }

    return results
}

export const parseSearchTags = (data: any[]): TagSection[] => {
    const tagSections: TagSection[] = []

    const genres: Tag[] = (data || []).map((genre: any) => App.createTag({
        id: genre.slug,
        label: genre.name
    }))

    if (genres.length > 0) {
        tagSections.push(App.createTagSection({
            id: 'genres',
            label: 'Genres',
            tags: genres
        }))
    }

    // Content type filter
    const types: Tag[] = [
        { id: 'manga', label: 'Manga' },
        { id: 'manhwa', label: 'Manhwa' },
        { id: 'manhua', label: 'Manhua' }
    ]
    tagSections.push(App.createTagSection({
        id: 'type',
        label: 'Type',
        tags: types.map(t => App.createTag(t))
    }))

    // Status filter
    const statuses: Tag[] = [
        { id: 'ongoing', label: 'Ongoing' },
        { id: 'completed', label: 'Completed' }
    ]
    tagSections.push(App.createTagSection({
        id: 'status',
        label: 'Status',
        tags: statuses.map(s => App.createTag(s))
    }))

    return tagSections
}
