import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { parseStatus } from './DoujinDesuHelper'

const LANG = '🇮🇩'
const DATE_LOCALE = 'id-ID'

const stripLink = (value: string): string => (value ?? '').replace(/^\/manga\//, '').replace(/\/$/, '')

export const parseMangaList = (items: any[]): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []
    for (const item of items ?? []) {
        const slug = item?.slug ?? stripLink(item?.link_url ?? '')
        if (!slug || !item?.title) continue
        results.push(App.createPartialSourceManga({
            mangaId: slug,
            image: item?.cover_url || item?.image_url || '',
            title: item.title,
            subtitle: [
                item?.type ? String(item.type).toUpperCase() : '',
                item?.updated_at ? new Date(item.updated_at).toLocaleDateString(DATE_LOCALE) : ''
            ].filter(Boolean).join(' • ')
        }))
    }
    return results
}

export const parseMangaDetails = (data: any, mangaId: string): SourceManga => {
    const titles = [data?.title]
    const altTitles = String(data?.alt_titles ?? '')
    if (altTitles) {
        for (const alt of altTitles.split('|').map((x: string) => x.trim()).filter(Boolean)) {
            titles.push(alt)
        }
    }

    const genres: Tag[] = []
    for (const entry of data?.manga_genres ?? []) {
        const slug = entry?.genres?.slug
        const name = entry?.genres?.name
        if (slug && name) genres.push(App.createTag({ id: `genre:${slug}`, label: name }))
    }

    const tags: TagSection[] = []
    if (genres.length > 0) {
        tags.push(App.createTagSection({ id: 'genres', label: 'Genres', tags: genres }))
    }

    const infoParts = [
        data?.author ? `Author: ${data.author}` : '',
        data?.artist ? `Artist: ${data.artist}` : '',
        data?.type ? `Type: ${String(data.type).toUpperCase()}` : '',
        typeof data?.rating === 'number' && data.rating > 0 ? `Rating: ${data.rating}` : '',
        typeof data?.views === 'number' && data.views > 0 ? `Views: ${data.views}` : '',
        data?.serialization ? `Serialization: ${data.serialization}` : ''
    ].filter(Boolean)

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image: data?.cover_url || '',
            status: parseStatus(data?.status ?? ''),
            author: data?.author || data?.artist || 'Unknown',
            artist: data?.artist || data?.author || 'Unknown',
            desc: [String(data?.description ?? '').trim(), infoParts.join('\n')].filter(Boolean).join('\n\n'),
            tags,
            covers: data?.cover_url ? [data.cover_url] : []
        })
    })
}

export const parseChapterList = (chapters: any[], mangaId: string): Chapter[] => {
    const result: Chapter[] = []
    const sorted = [...(chapters ?? [])].sort((a, b) => (b?.chapter_number ?? 0) - (a?.chapter_number ?? 0))
    let sortingIndex = 0
    for (const ch of sorted) {
        const id = ch?.id
        if (!id) continue
        const num = ch?.chapter_number
        result.push(App.createChapter({
            id,
            chapNum: typeof num === 'number' ? num : 0,
            name: typeof num === 'number' ? `Chapter ${num}` : (ch?.title ?? 'Chapter'),
            langCode: LANG,
            time: ch?.created_at ? new Date(ch.created_at) : new Date(),
            sortingIndex
        }))
        sortingIndex--
    }
    return result
}

export const parseChapterDetails = (data: any, mangaId: string, chapterId: string): ChapterDetails => {
    const pages: string[] = []
    for (const url of data?.content_urls ?? []) {
        if (typeof url === 'string' && url) pages.push(url)
    }
    if (pages.length === 0) throw new Error(`No pages found for chapter ${chapterId}`)
    return App.createChapterDetails({
        id: chapterId,
        mangaId,
        pages
    })
}

export const parseSearchTags = (genres: any[]): TagSection[] => {
    const tags: Tag[] = []
    for (const g of genres ?? []) {
        if (g?.slug && g?.name) tags.push(App.createTag({ id: `genre:${g.slug}`, label: g.name }))
    }
    return tags.length > 0
        ? [App.createTagSection({ id: 'genres', label: 'Genres', tags })]
        : []
}
