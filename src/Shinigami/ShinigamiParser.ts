import { PartialSourceManga, MangaInfo, TagSection, Tag } from '@paperback/types'
import { getTaxonomyNames, parseTaxonomyTags, parseStatus } from './ShinigamiHelper'

const CDN_URL = 'https://storage.shngm.id'
const BASE_URL = 'https://app.shinigami.asia'

export const parseMangaDetails = (data: any, mangaId: string) => {
    const mangaInfo = data.data
    const taxonomy = mangaInfo.taxonomy

    const titles = [mangaInfo.title, mangaInfo.alternative_title].filter(Boolean)
    
    const genreTags = (taxonomy.Genre ?? []).map((item: any) => App.createTag({
        id: item.slug,
        label: item.name
    }))

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles: titles,
            image: mangaInfo.cover_portrait_url || mangaInfo.cover_image_url,
            status: parseStatus(mangaInfo.status),
            author: (taxonomy.Author ?? []).map((item: any) => item.name).join(', ') || 'Unknown',
            artist: (taxonomy.Artist ?? []).map((item: any) => item.name).join(', ') || 'Unknown',
            desc: mangaInfo.description,
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

export const parseChapterDetails = (data: any, mangaId: string, chapterId: string): ChapterDetails => {
    const chapterData = data.data
    const chapter = chapterData.chapter
    
    const pages = chapter.data.map((page: string) => {
        const imageUrl = `${chapterData.base_url}${chapter.path}${page}`
        return {
            url: imageUrl,
            headers: {
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'DNT': '1',
                'Referer': BASE_URL + '/',
                'Sec-Fetch-Dest': 'empty',
                'Sec-GPC': '1',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            }
        }
    })

    return App.createChapterDetails({
        id: chapterId,
        mangaId: mangaId,
        pages: pages,
        longStrip: false
    })
}

export const parseMangaList = (data: any): PartialSourceManga[] => {
    return data.data.map((item: any) => App.createPartialSourceManga({
        mangaId: String(item.manga_id),
        image: item.cover_image_url ?? '',
        title: item.title ?? '',
        subtitle: `Latest: Chapter ${item.latest_chapter?.chapter_number ?? 'N/A'}`
    }))
}