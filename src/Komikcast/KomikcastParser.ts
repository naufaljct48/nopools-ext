import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { parseStatus, parseDate } from './KomikcastHelper'

export const parseMangaDetails = (data: any, mangaId: string): SourceManga => {
    const mangaData = data.data
    
    const titles = [mangaData.title]
    if (mangaData.nativeTitle) {
        titles.push(mangaData.nativeTitle)
    }
    
    // Parse genres from the genres array
    const genreTags: Tag[] = (mangaData.genres || []).map((genre: any) => App.createTag({
        id: `genre_${genre.id}`,
        label: genre.data?.name || ''
    }))
    
    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image: mangaData.coverImage || '',
            status: parseStatus(mangaData.status),
            author: mangaData.author || 'Unknown',
            artist: mangaData.author || 'Unknown',
            desc: mangaData.synopsis || '',
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
    
    for (const chapter of data || []) {
        const chapterData = chapter.data
        // Use chapter index as ID since API endpoint uses index, not chapter ID
        const chapterIndex = chapterData.index?.toString() || ''
        
        chapters.push(App.createChapter({
            id: chapterIndex,
            chapNum: chapterData.index || 0,
            name: chapterData.title || `Chapter ${chapterData.index}`,
            time: parseDate(chapter.createdAt),
            langCode: '🇮🇩',
            sortingIndex: sortingIndex--
        }))
    }
    
    return chapters
}

export const parseChapterDetails = (data: any, mangaId: string, chapterId: string): ChapterDetails => {
    const chapterData = data.data
    
    // Use the images array directly from the response
    const pages: string[] = chapterData.images || []
    
    return App.createChapterDetails({
        id: chapterId,
        mangaId,
        pages
    })
}

export const parseMangaList = (data: any[]): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []
    
    for (const item of data || []) {
        const mangaData = item.data
        const chapters = item.chapters || []
        const latestChapter = chapters[0]
        
        // Use latest chapter number if available, otherwise show total chapters
        let subtitle = ''
        if (latestChapter?.data?.index) {
            subtitle = `Ch. ${latestChapter.data.index}`
        } else if (mangaData.totalChapters) {
            subtitle = `${mangaData.totalChapters} Chapters`
        }
        
        results.push(App.createPartialSourceManga({
            mangaId: mangaData.slug || item.id.toString(),
            image: mangaData.coverImage || '',
            title: mangaData.title || '',
            subtitle
        }))
    }
    
    return results
}

export const parseSearchTags = (data: any[]): TagSection[] => {
    const tagSections: TagSection[] = []

    // Parse genres from API
    const genres: Tag[] = []
    for (const genre of data || []) {
        const genreName = genre.data?.name || ''
        genres.push(App.createTag({
            id: genreName,
            label: genreName
        }))
    }

    if (genres.length > 0) {
        tagSections.push(App.createTagSection({
            id: 'genres',
            label: 'Genres',
            tags: genres
        }))
    }

    // Add status filter
    const statuses: Tag[] = [
        { id: 'ongoing', label: 'Ongoing' },
        { id: 'completed', label: 'Completed' },
        { id: 'hiatus', label: 'Hiatus' },
        { id: 'cancelled', label: 'Cancelled' }
    ]
    tagSections.push(App.createTagSection({
        id: 'status',
        label: 'Status',
        tags: statuses.map(s => App.createTag(s))
    }))

    // Add format/type filter
    const formats: Tag[] = [
        { id: 'manga', label: 'Manga' },
        { id: 'manhwa', label: 'Manhwa' },
        { id: 'manhua', label: 'Manhua' },
        { id: 'webtoon', label: 'Webtoon' }
    ]
    tagSections.push(App.createTagSection({
        id: 'format',
        label: 'Format',
        tags: formats.map(f => App.createTag(f))
    }))

    return tagSections
}
