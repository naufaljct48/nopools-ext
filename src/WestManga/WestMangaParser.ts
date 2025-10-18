import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { decode as decodeHTMLEntity } from 'html-entities'

// Parser untuk API WestManga (JSON)

export const parseMangaDetails = (json: any, mangaId: string): SourceManga => {
    const data = json?.data ?? {}

    const titles: string[] = []
    const title = data?.title ?? ''
    if (title) titles.push(decodeHTMLEntity(title))

    const image: string = data?.cover ?? ''
    const statusRaw: string = String(data?.status ?? '').toLowerCase()
    const status: string = statusRaw === 'ongoing' ? 'Ongoing' : statusRaw === 'completed' ? 'Completed' : 'Unknown'
    const author: string = data?.author ?? 'Unknown'

    const arrayTags: Tag[] = (Array.isArray(data?.genres) ? data.genres : []).map((g: any) => ({
        id: String(g?.id ?? ''),
        label: String(g?.name ?? '')
    })).filter((t: Tag) => t.id && t.label)

    const tagSections: TagSection[] = [App.createTagSection({ id: '0', label: 'genres', tags: arrayTags.map((x) => App.createTag(x)) })]
    const desc: string = data?.sinopsis ?? ''

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image,
            status,
            author,
            artist: author,
            tags: tagSections,
            desc
        })
    })
}

export const parseChapterList = (json: any): Chapter[] => {
    const list = Array.isArray(json?.data?.chapters) ? json.data.chapters : []
    const chapters: Chapter[] = []
    let sortingIndex = 0

    for (const ch of list) {
        const slug: string = ch?.slug ?? ''
        const id: string = slug ? `/v/${slug}` : ''
        const numberStr: string = ch?.number ?? '0'
        const chapNum: number = parseFloat(String(numberStr).replace(',', '.')) || 0
        const updatedTime: number = ch?.updated_at?.time ?? ch?.created_at?.time ?? Math.floor(Date.now() / 1000)
        if (!id) continue
        chapters.push(App.createChapter({
            id,
            langCode: '🇮🇩',
            chapNum,
            name: `Chapter ${numberStr}`,
            time: new Date(updatedTime * 1000),
            sortingIndex: sortingIndex--,
            volume: 0,
            group: ''
        }))
    }

    // Return the created Chapter array directly to maintain the correct return type expected by Paperback
    return chapters
}

export const parseChapterDetails = (json: any, mangaId: string, chapterId: string): ChapterDetails => {
    const pages: string[] = (Array.isArray(json?.data?.images) ? json.data.images : [])
        .map((x: any) => String(x))
        .filter((x: string) => x.length > 0)

    if (pages.length === 0) throw new Error(`Failed to find any pages for chapter ${chapterId} of manga ${mangaId}`)

    return App.createChapterDetails({ id: chapterId, mangaId, pages })
}

// Digunakan untuk homepage sections dan hasil pencarian (contents)
export const parseMangaList = (json: any): PartialSourceManga[] => {
    const items = Array.isArray(json?.data) ? json.data : []
    const results: PartialSourceManga[] = []
    for (const it of items) {
        const slug: string = it?.slug ?? ''
        const title: string = it?.title ?? ''
        const image: string = it?.cover ?? ''
        const lastCh = Array.isArray(it?.lastChapters) ? it.lastChapters[0] : undefined
        const subtitle: string = lastCh ? `Ch. ${lastCh.number}` : ''
        if (!slug || !title) continue
        results.push(App.createPartialSourceManga({
            mangaId: slug,
            image,
            title: decodeHTMLEntity(title),
            subtitle
        }))
    }
    return results
}

export const parseSearchTags = (json: any): TagSection[] => {
    const items = Array.isArray(json?.data) ? json.data : []
    const tags: Tag[] = items.map((g: any) => ({ id: String(g?.id ?? ''), label: String(g?.name ?? '') }))
        .filter((t: Tag) => t.id && t.label)
    return [App.createTagSection({ id: 'genres', label: 'Genres', tags: tags.map((t) => App.createTag(t)) })]
}