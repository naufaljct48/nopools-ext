import { PartialSourceManga, MangaInfo, TagSection, Tag } from '@paperback/types'
import { getTaxonomyNames, parseTaxonomyTags, parseStatus } from './ShinigamiHelper'

export const parseMangaDetails = (data: any, mangaId: string) => {
    const mangaInfo = data.data
    const taxonomy = mangaInfo.taxonomy
    const titles = [mangaInfo.title, mangaInfo.alternative_title].filter(Boolean)
    const tags: Tag[] = parseTaxonomyTags(taxonomy, 'Genre')

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles: titles,
            image: mangaInfo.cover_portrait_url || mangaInfo.cover_image_url,
            status: parseStatus(mangaInfo.status),
            author: getTaxonomyNames(taxonomy, 'Author'),
            artist: getTaxonomyNames(taxonomy, 'Artist'),
            desc: mangaInfo.description,
            tags: [
                App.createTagSection({
                    id: 'genres',
                    label: 'Genres',
                    tags: tags
                })
            ]
        })
    })
}

export const parseChapterList = (data: any, mangaId: string) => {
    return data.data.map((chapter: any) => App.createChapter({
        id: chapter.chapter_id,
        mangaId: mangaId,
        chapNum: chapter.chapter_number,
        name: `Chapter ${chapter.chapter_number}`,
        time: new Date(chapter.release_date),
        langCode: 'id'
    }))
}

export const parseChapterDetails = (data: any, mangaId: string, chapterId: string) => {
    const chapter = data.data.chapter
    return App.createChapterDetails({
        id: chapterId,
        mangaId: mangaId,
        pages: chapter.data.map((page: string) => `${CDN_URL}${chapter.path}${page}`)
    })
}

export const parseMangaList = (data: any): PartialSourceManga[] => {
    return data.data.map((item: any) => App.createPartialSourceManga({
        id: String(item.manga_id),
        image: item.cover_image_url ?? '',
        title: item.title ?? '',
        subtitle: `Latest: Chapter ${item.latest_chapter?.chapter_number ?? 'N/A'}`
    }))
}