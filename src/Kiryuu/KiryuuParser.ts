import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { CheerioAPI } from 'cheerio'
import { decodeHTMLEntity, convertTime, normalizeUrl } from './KiryuuHelper'

/**
 * Parse manga details page
 */
export const parseMangaDetails = ($: CheerioAPI, mangaId: string): SourceManga => {
    const titles: string[] = []
    
    // Main title
    const mainTitle = $('h1[itemprop="name"]').first().text().trim()
    if (mainTitle) titles.push(decodeHTMLEntity(mainTitle))

    // Alternative titles
    const altTitle = $('.text-sm.text-text.line-clamp-1').first().text().trim()
    if (altTitle) {
        const altTitles = altTitle.split(',').map((t: string) => t.trim()).filter((t: string) => t)
        titles.push(...altTitles.map((t: string) => decodeHTMLEntity(t)))
    }

    // Image - try multiple selectors
    let image = ''
    
    // Try parent div with itemprop="image" then find img inside
    const imageParent = $('[itemprop="image"]')
    if (imageParent.length > 0) {
        image = imageParent.find('img').first().attr('src') ?? ''
    }
    
    // Fallback to wp-post-image class (WordPress standard)
    if (!image) {
        image = $('img.wp-post-image').first().attr('src') ?? ''
    }
    
    // Fallback to common manga cover selectors
    if (!image) {
        image = $('.rounded-lg img').first().attr('src') ?? ''
    }
    
    if (!image) {
        // Last resort: any img in the sidebar/cover area
        image = $('.sm\\:w-\\[17rem\\] img, .flex.w-full.h-auto img').first().attr('src') ?? ''
    }
    
    image = normalizeUrl(image)

    // Status
    const statusText = $('.bg-accent.text-xs.px-2.py-0\\.5.rounded-lg').first().text().trim().toLowerCase()
    const status = statusText.includes('ongoing') ? 'Ongoing' : statusText.includes('completed') ? 'Completed' : 'Unknown'

    // Author
    let author = 'Unknown'
    $('.flex.sm\\:justify-between.justify-start.items-center.gap-2').each((_: number, elem: any) => {
        const label = $('h4', elem).text().toLowerCase()
        if (label.includes('author')) {
            author = $('.inline p', elem).text().trim() || 'Unknown'
        }
    })

    // Genres/Tags
    const arrayTags: Tag[] = []
    $('a[itemprop="genre"]').each((_: number, elem: any) => {
        const label = $('span', elem).text().trim()
        const href = $(elem).attr('href') ?? ''
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

    // Description - try both data-show attributes
    let desc = $('div[itemprop="description"][data-show="true"]').first().text().trim()
    if (!desc) {
        desc = $('div[itemprop="description"][data-show="false"]').first().text().trim()
    }

    // Additional info
    let type = ''
    let released = ''
    let views = ''
    let rating = ''

    $('.space-y-2 .flex.sm\\:justify-between.justify-start.items-center.gap-2').each((_: number, elem: any) => {
        const label = $('h4', elem).text().toLowerCase()
        const value = $('.inline p, .inline', elem).text().trim()

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

    // Build description with additional info
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

/**
 * Parse chapter list from AJAX response
 */
export const parseChapterList = ($: CheerioAPI, mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    let sortingIndex = 0

    $('div[data-chapter-number]').each((_: number, elem: any) => {
        const $elem = $(elem)
        const link = $('a', $elem).first()
        const chapterUrl = link.attr('href') ?? ''
        const chapterId = chapterUrl.split('/').filter((x: string) => x).pop() ?? ''
        
        if (!chapterId) return

        // Chapter number from data attribute
        const chapNumStr = $elem.attr('data-chapter-number') ?? '0'
        const chapNum = parseFloat(chapNumStr) || 0

        // Chapter title
        const title = $('.font-medium.text-base span', $elem).first().text().trim()
        const name = title || `Chapter ${chapNumStr}`

        // Time
        const timeStr = $('time', $elem).attr('datetime') ?? $('time', $elem).text().trim()
        const time = timeStr ? (timeStr.includes('T') ? new Date(timeStr) : convertTime(timeStr)) : new Date()

        chapters.push(App.createChapter({
            id: chapterId,
            mangaId,
            chapNum,
            name: decodeHTMLEntity(name),
            time,
            langCode: '🇮🇩',
            sortingIndex: sortingIndex--
        }))
    })

    return chapters
}

/**
 * Parse chapter details/images
 */
export const parseChapterDetails = ($: CheerioAPI, mangaId: string, chapterId: string): ChapterDetails => {
    const pages: string[] = []

    // Images are in section[data-image-data]
    $('section[data-image-data] img').each((_: number, elem: any) => {
        const src = $(elem).attr('src') ?? ''
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

/**
 * Parse manga list (for homepage sections and search results)
 */
export const parseMangaList = ($: CheerioAPI): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []

    // For trending slider
    $('.swiper-slide.manga-swipe, .swiper-slide').each((_: number, elem: any) => {
        const $elem = $(elem)
        const link = $('a', $elem).first()
        const href = link.attr('href') ?? ''
        const mangaId = href.split('/').filter((x: string) => x).pop() ?? ''
        
        if (!mangaId) return

        const title = link.attr('title') ?? $('a', $elem).attr('title') ?? ''
        const image = normalizeUrl($('img', $elem).first().attr('src') ?? '')
        
        // Try to get latest chapter info
        let subtitle = ''
        const chapterText = $('.text-sm.text-gray-300', $elem).first().text().trim()
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

    // Search modal results (AJAX search)
    $('#searchResults a').each((_: number, elem: any) => {
        const $elem = $(elem)
        const href = $elem.attr('href') ?? ''
        const mangaId = href.split('/').filter((x: string) => x).pop() ?? ''
        if (!mangaId) return

        const title = $elem.find('h3').first().text().trim() || $elem.attr('title') || ''
        const image = normalizeUrl($elem.find('img').first().attr('src') ?? '')
        const subtitle = $elem.find('p').first().text().trim() || ''

        if (title) {
            results.push(App.createPartialSourceManga({
                mangaId,
                image,
                title: decodeHTMLEntity(title),
                subtitle: decodeHTMLEntity(subtitle)
            }))
        }
    })

    // For advanced search results / latest updates
    $('.flex.flex-col.justify-between.px-4.py-1\\.5').each((_: number, elem: any) => {
        const $elem = $(elem)
        const link = $('a.text-base', $elem).first()
        const href = link.attr('href') ?? ''
        const mangaId = href.split('/').filter((x: string) => x).pop() ?? ''
        
        if (!mangaId) return

        const title = link.text().trim()
        const image = normalizeUrl($('img', $elem.parent()).first().attr('src') ?? '')
        
        // Latest chapter
        const chapterText = $('.text-sm.text-gray-300', $elem).first().text().trim()
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

/**
 * Parse search tags/genres from advanced search page or fallback to local genre file
 */
export const parseSearchTags = ($: CheerioAPI): TagSection[] => {
    const genres: Tag[] = []
    const types: Tag[] = []
    const statuses: Tag[] = []

    // Parse genres from page
    $('button[data-genre]').each((_: number, elem: any) => {
        const $elem = $(elem)
        const id = $elem.attr('data-genre') ?? ''
        const label = $elem.text().trim()
        if (id && label) {
            genres.push({ id, label: decodeHTMLEntity(label) })
        }
    })

    // If no genres found from live page, use fallback list from KiryuuGenre.html (complete list)
    if (genres.length === 0) {
        genres.push(
            { id: '4-koma', label: '4-Koma' },
            { id: 'action', label: 'Action' },
            { id: 'adaptation', label: 'Adaptation' },
            { id: 'adult', label: 'Adult' },
            { id: 'adventure', label: 'Adventure' },
            { id: 'animals', label: 'Animals' },
            { id: 'anthology', label: 'Anthology' },
            { id: 'antihero', label: 'Antihero' },
            { id: 'award-winning', label: 'Award Winning' },
            { id: 'beasts', label: 'Beasts' },
            { id: 'bodyswap', label: 'Bodyswap' },
            { id: 'boys-love', label: "Boys' Love" },
            { id: 'bully', label: 'Bully' },
            { id: 'cartoon', label: 'Cartoon' },
            { id: 'childhood-friends', label: 'Childhood Friends' },
            { id: 'comedy', label: 'Comedy' },
            { id: 'comic', label: 'Comic' },
            { id: 'cooking', label: 'Cooking' },
            { id: 'crime', label: 'Crime' },
            { id: 'crossdressing', label: 'Crossdressing' },
            { id: 'dance', label: 'Dance' },
            { id: 'dark-fantasy', label: 'Dark Fantasy' },
            { id: 'delinquent', label: 'Delinquent' },
            { id: 'delinquents', label: 'Delinquents' },
            { id: 'dementia', label: 'Dementia' },
            { id: 'demon', label: 'Demon' },
            { id: 'demons', label: 'Demons' },
            { id: 'doujinshi', label: 'Doujinshi' },
            { id: 'drama', label: 'Drama' },
            { id: 'dungeons', label: 'Dungeons' },
            { id: 'ecchi', label: 'Ecchi' },
            { id: 'emperors-daughter', label: "Emperor's daughter" },
            { id: 'fan-colored', label: 'Fan-Colored' },
            { id: 'fantas', label: 'Fantas' },
            { id: 'fantasy', label: 'Fantasy' },
            { id: 'fetish', label: 'Fetish' },
            { id: 'food', label: 'Food' },
            { id: 'full-color', label: 'Full Color' },
            { id: 'game', label: 'Game' },
            { id: 'gender-bender', label: 'Gender Bender' },
            { id: 'genderswap', label: 'Genderswap' },
            { id: 'ghosts', label: 'Ghosts' },
            { id: 'girls-love', label: "Girls' Love" },
            { id: 'gore', label: 'Gore' },
            { id: 'gyaru', label: 'Gyaru' },
            { id: 'harem', label: 'Harem' },
            { id: 'historical', label: 'Historical' },
            { id: 'horror', label: 'Horror' },
            { id: 'incest', label: 'Incest' },
            { id: 'isekai', label: 'Isekai' },
            { id: 'josei', label: 'Josei' },
            { id: 'loli', label: 'Loli' },
            { id: 'lolicon', label: 'Lolicon' },
            { id: 'long-strip', label: 'Long Strip' },
            { id: 'magic', label: 'Magic' },
            { id: 'magical-girls', label: 'Magical Girls' },
            { id: 'martial-arts', label: 'Martial Arts' },
            { id: 'mature', label: 'Mature' },
            { id: 'mecha', label: 'Mecha' },
            { id: 'medical', label: 'Medical' },
            { id: 'military', label: 'Military' },
            { id: 'monster-girls', label: 'Monster Girls' },
            { id: 'monsters', label: 'Monsters' },
            { id: 'music', label: 'Music' },
            { id: 'mystery', label: 'Mystery' },
            { id: 'ninja', label: 'Ninja' },
            { id: 'office-workers', label: 'Office Workers' },
            { id: 'official-colored', label: 'Official Colored' },
            { id: 'oneshot', label: 'Oneshot' },
            { id: 'parody', label: 'Parody' },
            { id: 'philosophical', label: 'Philosophical' },
            { id: 'police', label: 'Police' },
            { id: 'post-apocalyptic', label: 'Post-Apocalyptic' },
            { id: 'psychological', label: 'Psychological' },
            { id: 'reincarnation', label: 'Reincarnation' },
            { id: 'reverse-harem', label: 'Reverse Harem' },
            { id: 'romance', label: 'Romance' },
            { id: 'samurai', label: 'Samurai' },
            { id: 'school-life', label: 'School Life' },
            { id: 'sci-fi', label: 'Sci-Fi' },
            { id: 'seinen', label: 'Seinen' },
            { id: 'sexual-violence', label: 'Sexual Violence' },
            { id: 'shota', label: 'Shota' },
            { id: 'shotacon', label: 'Shotacon' },
            { id: 'shoujo', label: 'Shoujo' },
            { id: 'shoujo-ai', label: 'Shoujo Ai' },
            { id: 'shounen', label: 'Shounen' },
            { id: 'shounen-ai', label: 'Shounen Ai' },
            { id: 'slice-of-life', label: 'Slice of Life' },
            { id: 'sm-bdsm', label: 'SM/BDSM' },
            { id: 'smut', label: 'Smut' },
            { id: 'space', label: 'Space' },
            { id: 'sports', label: 'Sports' },
            { id: 'super-power', label: 'Super Power' },
            { id: 'superhero', label: 'Superhero' },
            { id: 'supernatural', label: 'Supernatural' },
            { id: 'survival', label: 'Survival' },
            { id: 'thriller', label: 'Thriller' },
            { id: 'time-travel', label: 'Time Travel' },
            { id: 'traditional-games', label: 'Traditional Games' },
            { id: 'tragedy', label: 'Tragedy' },
            { id: 'vamp', label: 'Vamp' },
            { id: 'vampires', label: 'Vampires' },
            { id: 'video-games', label: 'Video Games' },
            { id: 'villainess', label: 'Villainess' },
            { id: 'violence', label: 'Violence' },
            { id: 'virtual-reality', label: 'Virtual Reality' },
            { id: 'web-comic', label: 'Web Comic' },
            { id: 'wuxia', label: 'Wuxia' },
            { id: 'yaoi', label: 'Yaoi' },
            { id: 'yuri', label: 'Yuri' },
            { id: 'zombies', label: 'Zombies' }
        )
    }

    // Parse types
    $('button[data-type]').each((_: number, elem: any) => {
        const $elem = $(elem)
        const id = $elem.attr('data-type') ?? ''
        const label = $elem.text().trim()
        if (id && label) {
            // Deduplicate types
            if (!types.find((t: Tag) => t.id === id)) {
                types.push({ id, label: decodeHTMLEntity(label) })
            }
        }
    })

    // If no types found, add common ones
    if (types.length === 0) {
        types.push(
            { id: 'manga', label: 'Manga' },
            { id: 'manhwa', label: 'Manhwa' },
            { id: 'manhua', label: 'Manhua' },
            { id: 'comic', label: 'Comic' },
            { id: 'novel', label: 'Novel' }
        )
    }

    // Status options (hardcoded common values)
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

/**
 * Parse chapter list from JSON response
 */
export const parseChapterListFromJson = (json: any, mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    
    if (!json.success || !json.data) {
        return chapters
    }

    let sortingIndex = 0

    for (const item of json.data) {
        const title = item.title ?? ''
        const url = item.url ?? ''
        const chapterId = url.split('/').filter((x: string) => x).pop() ?? ''
        
        if (!chapterId) continue

        const chapMatch = title.match(/Chapter\s+([\d.]+)/i)
        const chapNum = chapMatch ? parseFloat(chapMatch[1]) : 0

        chapters.push(App.createChapter({
            id: chapterId,
            mangaId,
            chapNum,
            name: decodeHTMLEntity(title),
            time: new Date(),
            langCode: '🇮🇩',
            sortingIndex: sortingIndex--
        }))
    }

    return chapters
}
