import { MangaStreamParser } from '../MangaStreamParser'
import { CheerioAPI } from 'cheerio'
import { Chapter, ChapterDetails, SourceManga, Tag, TagSection } from '@paperback/types'
import { ShinigamiMangaDetailResponse, ShinigamiChapterListResponse, ShinigamiPageListResponse } from './ShinigamiInterfaces'

export class ShinigamiParser extends MangaStreamParser {
    parseMangaDetails($: CheerioAPI, mangaId: string, source: any): SourceManga {
        const result = JSON.parse($.html()) as ShinigamiMangaDetailResponse
        const data = result.data

        const tags: Tag[] = []
        if (data.taxonomy.Genre) {
            data.taxonomy.Genre.forEach(genre => {
                tags.push({ id: genre.name, label: genre.name })
            })
        }

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [data.title ?? ''],
                image: data.thumbnail ?? '',
                status: data.status === 1 ? 'Ongoing' : 'Completed',
                author: data.taxonomy.Author?.map(x => x.name).join(', ') ?? 'Unknown',
                artist: data.taxonomy.Artist?.map(x => x.name).join(', ') ?? 'Unknown',
                tags: [App.createTagSection({ id: '0', label: 'genres', tags: tags })],
                desc: data.description ?? ''
            })
        })
    }

    parseChapterList($: CheerioAPI, mangaId: string, source: any): Chapter[] {
        const result = JSON.parse($.html()) as ShinigamiChapterListResponse
        
        return result.chapterList.map(chapter => {
            return App.createChapter({
                id: chapter.chapterId,
                mangaId: mangaId,
                name: `Chapter ${chapter.name.toString().replace('.0', '')} ${chapter.title}`,
                langCode: '🇮🇩',
                chapNum: Number(chapter.name),
                time: new Date(chapter.date).getTime()
            })
        })
    }

    parseChapterDetails($: CheerioAPI, mangaId: string, chapterId: string): ChapterDetails {
        const result = JSON.parse($.html()) as ShinigamiPageListResponse
        
        const pages = result.pageList.chapterPage.pages
            .filter(page => !page.startsWith('999-'))
            .map(page => {
                const originalUrl = `https://storage.shngm.id${result.pageList.chapterPage.path}${page}`
                return `https://resize${originalUrl}`
            })

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: false
        })
    }
}