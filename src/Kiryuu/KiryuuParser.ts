import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { decodeHTMLEntity, convertTime, normalizeUrl } from './KiryuuHelper'

// Simple HTML parser using DOMParser (no cheerio bundle)
const parseHTML = (html: string): Document => {
    const parser = new DOMParser()
    return parser.parseFromString(html, 'text/html')
}

const $ = (doc: Document, selector: string): Element | null => {
    return doc.querySelector(selector)
}

const $$ = (doc: Document, selector: string): Element[] => {
    return Array.from(doc.querySelectorAll(selector))
}

const text = (el: Element | null): string => {
    return el?.textContent?.trim() ?? ''
}

const attr = (el: Element | null, attribute: string): string => {
    return el?.getAttribute(attribute) ?? ''
}

export const parseMangaDetails = (doc: Document, mangaId: string): SourceManga => {
    const titles: string[] = []
    
    const mainTitle = text($(doc, 'h1[itemprop="name"]'))
    if (mainTitle) titles.push(decodeHTMLEntity(mainTitle))

    const altTitle = text($(doc, '.text-sm.text-text.line-clamp-1'))
    if (altTitle) {
        const altTitles = altTitle.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        titles.push(...altTitles.map((t: string) => decodeHTMLEntity(t)))
    }

    let image = ''
    const imageParent = $(doc, '[itemprop="image"]')
    if (imageParent) {
        const img = imageParent.querySelector('img')
        image = attr(img, 'src')
    }
    
    if (!image) {
        image = attr($(doc, 'img.wp-post-image'), 'src')
    }
    
    if (!image) {
        image = attr($(doc, '.rounded-lg img'), 'src')
    }
    
    if (!image) {
        const imgs = $$(doc, '.sm\\:w-\\[17rem\\] img, .flex.w-full.h-auto img')
        image = imgs.length > 0 ? attr(imgs[0], 'src') : ''
    }
    
    image = normalizeUrl(image)

    const statusText = text($(doc, '.bg-accent.text-xs.px-2.py-0\\.5.rounded-lg')).toLowerCase()
    const status = statusText.includes('ongoing') ? 'Ongoing' : statusText.includes('completed') ? 'Completed' : 'Unknown'

    let author = 'Unknown'
    $$(doc, '.flex.sm\\:justify-between.justify-start.items-center.gap-2').forEach((elem: Element) => {
        const label = text(elem.querySelector('h4')).toLowerCase()
        if (label.includes('author')) {
            author = text(elem.querySelector('.inline p')) || 'Unknown'
        }
    })

    const arrayTags: Tag[] = []
    $$(doc, 'a[itemprop="genre"]').forEach((elem: Element) => {
        const label = text(elem.querySelector('span'))
        const href = attr(elem, 'href')
        const id = href.split('/').filter((x: string) => x).pop() ?? ''
        if (id && label) {
            arrayTags.push({ id, label: decodeHTMLEntity(label) })
        }
    })

    const tagSections: TagSection[] = []
    if (arrayTags.length > 0) {
        tagSections.push(App.createTagSection({ 
            id: '0', 
            label: 'genres', 
            tags: arrayTags.map((x: Tag) => App.createTag(x)) 
        }))
    }

    let desc = text($(doc, 'div[itemprop="description"][data-show="true"]'))
    if (!desc) {
        desc = text($(doc, 'div[itemprop="description"][data-show="false"]'))
    }

    let type = ''
    let released = ''
    let views = ''
    let rating = ''

    $$(doc, '.space-y-2 .flex.sm\\:justify-between.justify-start.items-center.gap-2').forEach((elem: Element) => {
        const label = text(elem.querySelector('h4')).toLowerCase()
        const value = text(elem.querySelector('.inline p, .inline'))

        if (label.includes('type')) {
            type = value
        } else if (label.includes('released')) {
            released = value
        } else if (label.includes('view')) {
            views = value
        } else if (label.includes('rating')) {
            rating = value
        }
    })

    if (type || released || views || rating) {
        const additionalInfo = []
        if (type) additionalInfo.push(`Type: ${type}`)
        if (released) additionalInfo.push(`Released: ${released}`)
        if (rating) additionalInfo.push(`Rating: ${rating}`)
        if (views) additionalInfo.push(`Views: ${views}`)
        
        if (desc) {
            desc = `${desc}\n\n${additionalInfo.join(' • ')}`
        } else {
            desc = additionalInfo.join(' • ')
        }
    }

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image,
            status,
            author,
            artist: author,
            tags: tagSections,
            desc: decodeHTMLEntity(desc)
        })
    })
}

export const parseChapterList = (doc: Document, mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    let sortingIndex = 0

    $$(doc, 'div[data-chapter-number]').forEach((elem: Element) => {
        const link = elem.querySelector('a')
        const chapterUrl = attr(link, 'href')
        const chapterId = chapterUrl.split('/').filter((x: string) => x).pop() ?? ''
        
        if (!chapterId) return

        const chapNumStr = attr(elem, 'data-chapter-number') ?? '0'
        const chapNum = parseFloat(chapNumStr) || 0

        const title = text(elem.querySelector('.font-medium.text-base span'))
        const name = title || `Chapter ${chapNumStr}`

        const timeStr = attr(elem.querySelector('time'), 'datetime') ?? text(elem.querySelector('time'))
        const time = timeStr ? (timeStr.includes('T') ? new Date(timeStr) : convertTime(timeStr)) : new Date()

        chapters.push(App.createChapter({
            id: chapterId,
            chapNum,
            name: decodeHTMLEntity(name),
            time,
            langCode: '🇮🇩',
            sortingIndex: sortingIndex--
        }))
    })

    return chapters
}

export const parseChapterDetails = (doc: Document, mangaId: string, chapterId: string): ChapterDetails => {
    const pages: string[] = []

    $$(doc, 'section[data-image-data] img').forEach((elem: Element) => {
        const src = attr(elem, 'src')
        if (src) {
            pages.push(normalizeUrl(src))
        }
    })

    if (pages.length === 0) {
        throw new Error(`Failed to find any pages for chapter ${chapterId} of manga ${mangaId}`)
    }

    return App.createChapterDetails({ 
        id: chapterId, 
        mangaId, 
        pages 
    })
}

export const parseMangaList = (doc: Document): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []

    $$(doc, '.swiper-slide.manga-swipe, .swiper-slide').forEach((elem: Element) => {
        const link = elem.querySelector('a')
        const href = attr(link, 'href')
        const mangaId = href.split('/').filter((x: string) => x).pop() ?? ''
        
        if (!mangaId) return

        const title = attr(link, 'title') ?? attr(elem.querySelector('a'), 'title') ?? ''
        const image = normalizeUrl(attr(elem.querySelector('img'), 'src'))
        
        let subtitle = ''
        const chapterText = text(elem.querySelector('.text-sm.text-gray-300'))
        if (chapterText) {
            subtitle = chapterText
        }

        if (title) {
            results.push(App.createPartialSourceManga({
                mangaId,
                image,
                title: decodeHTMLEntity(title),
                subtitle
            }))
        }
    })

    $$(doc, '#searchResults a').forEach((elem: Element) => {
        const href = attr(elem, 'href')
        const mangaId = href.split('/').filter((x: string) => x).pop() ?? ''
        if (!mangaId) return

        const title = text(elem.querySelector('h3')) || attr(elem, 'title') || ''
        const image = normalizeUrl(attr(elem.querySelector('img'), 'src'))
        const subtitle = text(elem.querySelector('p')) || ''

        if (title) {
            results.push(App.createPartialSourceManga({
                mangaId,
                image,
                title: decodeHTMLEntity(title),
                subtitle: decodeHTMLEntity(subtitle)
            }))
        }
    })

    $$(doc, '.flex.flex-col.justify-between.px-4.py-1\\.5').forEach((elem: Element) => {
        const link = elem.querySelector('a.text-base')
        const href = attr(link, 'href')
        const mangaId = href.split('/').filter((x: string) => x).pop() ?? ''
        
        if (!mangaId) return

        const title = text(link)
        const parent = elem.parentElement
        const image = parent ? normalizeUrl(attr(parent.querySelector('img'), 'src')) : ''
        
        const chapterText = text(elem.querySelector('.text-sm.text-gray-300'))
        const subtitle = chapterText

        if (title) {
            results.push(App.createPartialSourceManga({
                mangaId,
                image,
                title: decodeHTMLEntity(title),
                subtitle
            }))
        }
    })

    return results
}

export const parseSearchTags = (doc: Document): TagSection[] => {
    const genres: Tag[] = []
    const types: Tag[] = []
    const statuses: Tag[] = []

    $$(doc, 'button[data-genre]').forEach((elem: Element) => {
        const id = attr(elem, 'data-genre')
        const label = text(elem)
        if (id && label) {
            genres.push({ id, label: decodeHTMLEntity(label) })
        }
    })

    if (genres.length === 0) {
        genres.push(
            { id: 'action', label: 'Action' },
            { id: 'adventure', label: 'Adventure' },
            { id: 'comedy', label: 'Comedy' },
            { id: 'drama', label: 'Drama' },
            { id: 'ecchi', label: 'Ecchi' },
            { id: 'fantasy', label: 'Fantasy' },
            { id: 'harem', label: 'Harem' },
            { id: 'isekai', label: 'Isekai' },
            { id: 'martial-arts', label: 'Martial Arts' },
            { id: 'mature', label: 'Mature' },
            { id: 'mecha', label: 'Mecha' },
            { id: 'mystery', label: 'Mystery' },
            { id: 'psychological', label: 'Psychological' },
            { id: 'romance', label: 'Romance' },
            { id: 'school-life', label: 'School Life' },
            { id: 'sci-fi', label: 'Sci-Fi' },
            { id: 'seinen', label: 'Seinen' },
            { id: 'shoujo', label: 'Shoujo' },
            { id: 'shounen', label: 'Shounen' },
            { id: 'slice-of-life', label: 'Slice of Life' },
            { id: 'sports', label: 'Sports' },
            { id: 'supernatural', label: 'Supernatural' },
            { id: 'thriller', label: 'Thriller' }
        )
    }

    $$(doc, 'button[data-type]').forEach((elem: Element) => {
        const id = attr(elem, 'data-type')
        const label = text(elem)
        if (id && label) {
            if (!types.find((t: Tag) => t.id === id)) {
                types.push({ id, label: decodeHTMLEntity(label) })
            }
        }
    })

    if (types.length === 0) {
        types.push(
            { id: 'manga', label: 'Manga' },
            { id: 'manhwa', label: 'Manhwa' },
            { id: 'manhua', label: 'Manhua' }
        )
    }

    statuses.push({ id: 'ongoing', label: 'Ongoing' })
    statuses.push({ id: 'completed', label: 'Completed' })

    const sections: TagSection[] = []

    if (genres.length > 0) {
        sections.push(App.createTagSection({
            id: 'genre',
            label: 'Genres',
            tags: genres.map((x: Tag) => App.createTag(x))
        }))
    }

    if (types.length > 0) {
        sections.push(App.createTagSection({
            id: 'type',
            label: 'Type',
            tags: types.map((x: Tag) => App.createTag(x))
        }))
    }

    if (statuses.length > 0) {
        sections.push(App.createTagSection({
            id: 'status',
            label: 'Status',
            tags: statuses.map((x: Tag) => App.createTag(x))
        }))
    }

    return sections
}
