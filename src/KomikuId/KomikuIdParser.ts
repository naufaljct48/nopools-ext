import { 
    Tag,
    TagSection,
    Chapter,
    ChapterDetails
} from '@paperback/types'
import { CheerioAPI } from 'cheerio'

export class KomikuIdParser extends Parser {
    override parseTags($: CheerioAPI): TagSection[] {
        const sections: TagSection[] = []

        // Parse order/sort options
        const orderTags: Tag[] = []
        $('select[name="orderby"] option').each((_, el) => {
            const value = $(el).attr('value')
            const label = $(el).text().trim()
            if (value) {
                orderTags.push(App.createTag({ id: value, label }))
            }
        })
        sections.push(App.createTagSection({ id: '0', label: 'Order by', tags: orderTags }))

        // Parse genres
        const genreTags: Tag[] = []
        $('select[name="genre"] option').each((_, el) => {
            const value = $(el).attr('value')
            const label = $(el).text().trim()
            if (value && !label.includes('Genre 1')) {
                genreTags.push(App.createTag({ id: value, label }))
            }
        })
        sections.push(App.createTagSection({ id: '1', label: 'Genres', tags: genreTags }))

        // Parse status
        const statusTags: Tag[] = []
        $('select[name="status"] option').each((_, el) => {
            const value = $(el).attr('value')
            const label = $(el).text().trim()
            if (value) {
                statusTags.push(App.createTag({ id: value, label }))
            }
        })
        sections.push(App.createTagSection({ id: '2', label: 'Status', tags: statusTags }))

        // Parse types
        const typeTags: Tag[] = []
        $('select[name="category_name"] option').each((_, el) => {
            const value = $(el).attr('value')
            const label = $(el).text().trim()
            if (value) {
                typeTags.push(App.createTag({ id: value, label }))
            }
        })
        sections.push(App.createTagSection({ id: '3', label: 'Types', tags: typeTags }))

        return sections
    }

    override parseChapterList($: CheerioAPI, mangaId: string): Chapter[] {
        const chapters: Chapter[] = []
        
        for (const chapter of $('#Daftar_Chapter tbody tr').toArray()) {
            if ($(chapter).find('th').length > 0) continue // Skip header row
            
            const $link = $('td.judulseries a', chapter)
            const title = $link.find('span').text().trim()
            const id = this.idCleaner($link.attr('href') ?? '')
            const views = $('td.pembaca i', chapter).text().trim()
            const date = $('td.tanggalseries', chapter).text().trim()
            
            if (!id || !title) continue
            
            const chapNum = Number(title.match(/Chapter\s+(\d+)/i)?.[1] ?? -1)
            
            chapters.push(App.createChapter({
                id,
                mangaId,
                name: title,
                chapNum,
                time: new Date(date),
                langCode: 'id',
                views: Number(views)
            }))
        }
        
        return chapters
    }

    override parseChapterDetails($: CheerioAPI, mangaId: string, chapterId: string): ChapterDetails {
        const pages: string[] = []
        
        // Get all images from the reader
        for (const img of $('#Baca_Komik img.ww').toArray()) {
            const src = $(img).attr('src')
            if (!src) continue
            pages.push(src)
        }

        // Get navigation links
        const prevChapter = $('div.nxpr a:first-child').attr('href')
        const nextChapter = $('div.nxpr a:last-child').attr('href')

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: true,
            nextChapter: nextChapter ? this.idCleaner(nextChapter) : undefined,
            prevChapter: prevChapter ? this.idCleaner(prevChapter) : undefined
        })
    }

    private idCleaner(str: string): string {
        // Remove leading/trailing slashes and domain
        return str.replace(/^\/|\/$/g, '').replace(/^https?:\/\/[^/]+\//, '')
    }
}