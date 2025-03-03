import { convertDate } from '../LanguageUtils';
import { MangaStreamParser } from '../MangaStreamParser';
import { 
    ChapterDetails, 
    SourceManga, 
    Chapter, 
    PartialSourceManga, 
    TagSection, 
    Tag,
} from '@paperback/types'
import { CheerioAPI } from 'cheerio';

export class KomikcastParser extends MangaStreamParser {
    // Add decodeHTMLEntity helper method
    private decodeHTMLEntity(str: string): string {
        return str.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
    }

    override parseMangaDetails($: CheerioAPI, mangaId: string, source: any): SourceManga {
        const titles: string[] = []
        const mainTitle = $('h1.komik_info-content-body-title').text().trim().replace(/Bahasa Indonesia/g, '')
        titles.push(this.decodeHTMLEntity(mainTitle))

        const altTitle = $('.komik_info-content-native').text().trim()
        if (altTitle) titles.push(this.decodeHTMLEntity(altTitle))

        const image = $('div.komik_info-content-thumbnail img').attr('src')
        const description = $('.komik_info-description-sinopsis').text().trim()

        const arrayTags: Tag[] = []
        for (const tag of $('span.komik_info-content-genre a').toArray()) {
            const label = $(tag).text().trim()
            const id = this.idCleaner($(tag).attr('href') ?? '')
            if (!id || !label) continue
            arrayTags.push({ id, label })
        }

        const author = $('.komik_info-content-info:contains("Author:") b').next().text().trim()
        const status = $('.komik_info-content-info:contains("Status:") b').next().text().trim().toLowerCase()

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles,
                image: image ?? '',
                status: status === 'ongoing' ? 'Ongoing' : 'Completed',
                author: author || 'Unknown',
                artist: author || 'Unknown',
                tags: [App.createTagSection({ id: '0', label: 'genres', tags: arrayTags.map(x => App.createTag(x)) })],
                desc: description
            })
        })
    }

    override parseChapterList($: CheerioAPI, mangaId: string, source: any): Chapter[] {
        const chapters: Chapter[] = []
        
        for (const chapter of $('.komik_info-chapters-item').toArray()) {
            const $chapter = $(chapter)
            const title = $('a.chapter-link-item', $chapter).text().trim()
            const chapNum = Number(title.match(/Chapter\s+(\d+)/i)?.[1] ?? -1)
            const date = $('.chapter-link-time', $chapter).text().trim()
            const id = this.idCleaner($('a.chapter-link-item', $chapter).attr('href') ?? '')
            
            if (!id) continue
        
            chapters.push(App.createChapter({
                id: id,
                mangaId: mangaId,
                name: title,
                chapNum: chapNum,
                time: source.convertTime(date),
            }))
        }
    
        return chapters.map(chapter => {
            if (typeof chapter.chapNum !== 'number') {
                chapter.chapNum = -1
            }
            return chapter
        })
    }
    override parseChapterDetails($: CheerioAPI, mangaId: string, chapterId: string): ChapterDetails {
        const pages: string[] = []
        
        for (const img of $('img', '.main-reading-area').toArray()) {
            const src = $(img).attr('src') ?? $(img).attr('data-src')
            if (!src) continue
            pages.push(src)
        }
    
        // Get next/previous chapter links
        const nextChapter = $('div.nextprev a[rel="next"]').attr('href')
        const prevChapter = $('div.nextprev a[rel="prev"]').attr('href')
    
        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: false,
            nextChapter: nextChapter ? this.idCleaner(nextChapter) : undefined,
            prevChapter: prevChapter ? this.idCleaner(prevChapter) : undefined
        })
    }
    override async parseSearchResults($: CheerioAPI, source: any): Promise<PartialSourceManga[]> {
        const results: PartialSourceManga[] = [];
    
        for (const obj of $('div.list-update_item').toArray()) {
            const title = $('h3.title', obj).text().trim()
            const image = this.getImageSrc($('img', obj)) ?? ''
            const subtitle = $('div.chapter', obj).text().trim()
            const slug = this.idCleaner($('a', obj).attr('href') ?? '')
            const path = ($('a', obj).attr('href') ?? '').replace(/\/$/, '').split('/').slice(-2).shift() ?? ''
    
            if (!slug || !path) continue
    
            results.push({
                slug,
                path,
                image,
                title: this.decodeHTMLEntity(title),
                subtitle: this.decodeHTMLEntity(subtitle)
            })
        }
    
        return results
    }
    override isLastPage = ($: CheerioAPI, id: string): boolean => {
        let isLast = true;
    
        const hasNext = Boolean($('a.next.page-numbers').length)
        if (hasNext) {
            isLast = false
        }
    
        return isLast
    }
    override parseTags($: CheerioAPI): TagSection[] {
        const arrayTags: Tag[] = []
        const arrayTags2: Tag[] = []
        const arrayTags3: Tag[] = []
        const arrayTags4: Tag[] = []
    
        // Genre tags
        for (const tag of $('.genre > li > a').toArray()) {
            const label = $(tag).text().trim()
            const id = $(tag).attr('href')?.split('/')[4] ?? ''
            if (!id || !label) continue
            arrayTags.push({ id: id, label: label })
        }
    
        // Status tags
        arrayTags2.push(
            { id: 'ongoing', label: 'Ongoing' },
            { id: 'completed', label: 'Completed' }
        )
    
        // Type tags
        arrayTags3.push(
            { id: 'manga', label: 'Manga' },
            { id: 'manhwa', label: 'Manhwa' },
            { id: 'manhua', label: 'Manhua' }
        )
    
        // Sort tags
        arrayTags4.push(
            { id: 'popular', label: 'Popular' },
            { id: 'update', label: 'Latest Update' }
        )
    
        return [
            App.createTagSection({ id: '0', label: 'Genres', tags: arrayTags }),
            App.createTagSection({ id: '1', label: 'Status', tags: arrayTags2 }),
            App.createTagSection({ id: '2', label: 'Types', tags: arrayTags3 }),
            App.createTagSection({ id: '3', label: 'Sort By', tags: arrayTags4 })
        ]
    }
}
