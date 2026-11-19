import { Chapter, ChapterDetails, PartialSourceManga, SourceManga } from '@paperback/types'
import { decode as decodeHTMLEntity } from 'html-entities'
import { parseStatus } from './ShinigamiHelper'

export const parseMangaDetails = (data: any, mangaId: string): SourceManga => {
    const mangaInfo = data?.data ?? {}
    const taxonomy = mangaInfo?.taxonomy ?? {}

    const titles: string[] = []
    if (mangaInfo.title) titles.push(String(mangaInfo.title).trim())
    if (mangaInfo.alternative_title) {
        for (const alt of String(mangaInfo.alternative_title).split(/[|,]/)) {
            const clean = alt.trim()
            if (clean && !titles.includes(clean)) titles.push(clean)
        }
    }
    if (titles.length === 0) titles.push(mangaId)

    const genreTags = (taxonomy.Genre ?? []).map((item: any) => App.createTag({
        id: `genre:${item.slug}`,
        label: item.name
    }))

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image: mangaInfo.cover_portrait_url || mangaInfo.cover_image_url || '',
            status: parseStatus(mangaInfo.status),
            author: (taxonomy.Author ?? []).map((item: any) => item.name).join(', ') || 'Unknown',
            artist: (taxonomy.Artist ?? []).map((item: any) => item.name).join(', ') || 'Unknown',
            desc: decodeHTMLEntity(String(mangaInfo.description ?? '')).trim(),
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

    for (const chapter of chaptersRaw ?? []) {
        const id = String(chapter?.chapter_id ?? '').trim()
        if (!id || seen[id]) continue
        seen[id] = true

        const chapNum = Number(chapter?.chapter_number ?? 0)
        const name = String(chapter?.chapter_title ?? '').trim()
            ? `Chapter ${chapter.chapter_number}: ${String(chapter.chapter_title).trim()}`
            : `Chapter ${chapter.chapter_number}`

        const timeRaw = chapter?.release_date || chapter?.created_at || ''
        const time = timeRaw ? new Date(timeRaw) : new Date()

        chapters.push(App.createChapter({
            id,
            chapNum: isNaN(chapNum) ? 0 : chapNum,
            name,
            time: isNaN(time.getTime()) ? new Date() : time,
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
    const chapterData = data?.data ?? {}
    const chapter = chapterData?.chapter ?? {}
    const baseUrl = String(chapterData.base_url ?? '').replace(/\/+$/, '')
    const path = String(chapter.path ?? '')

    const pages: string[] = (Array.isArray(chapter.data) ? chapter.data : [])
        .map((page: string) => /^https?:\/\//i.test(page) ? page : `${baseUrl}${path}${page}`)
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

export const parseMangaList = (data: any): PartialSourceManga[] => {
    const list = Array.isArray(data?.data) ? data.data : []
    return list
        .filter((item: any) => item?.manga_id)
        .map((item: any) => App.createPartialSourceManga({
            mangaId: String(item.manga_id),
            image: item.cover_portrait_url || item.cover_image_url || '',
            title: String(item.title ?? ''),
            subtitle: item.latest_chapter_number !== undefined && item.latest_chapter_number !== null
                ? `Ch. ${item.latest_chapter_number}`
                : ''
        }))
}
