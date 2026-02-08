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
    const genres: Tag[] = []
    
    for (const genre of data || []) {
        genres.push(App.createTag({
            id: `genre_${genre.id}`,
            label: genre.data?.name || ''
        }))
    }
    
    return [
        App.createTagSection({
            id: 'genres',
            label: 'Genres',
            tags: genres
        })
    ]
}
