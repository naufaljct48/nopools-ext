import {
    Chapter,
    ChapterDetails,
    PartialSourceManga,
    SourceManga,
    Tag,
    TagSection
} from '@paperback/types'

import {
    countryLabel,
    extractEmbeddedJson,
    LANGUAGE_FLAGS,
    parseDate,
    parseStatus,
    stripHtml,
    toArray
} from './ComickHelper'

export const parseMangaDetails = (html: string, mangaId: string): SourceManga => {
    const data = extractEmbeddedJson(html, 'comic-data')

    const titles: string[] = []
    if (data.title) titles.push(String(data.title))
    for (const alt of toArray<any>(data.md_titles)) {
        const title = String(alt?.title ?? '').trim()
        if (title && !titles.includes(title)) titles.push(title)
    }
    if (titles.length === 0) titles.push(mangaId)

    const genreNames: string[] = []
    const type = countryLabel(data.country)
    if (type) genreNames.push(type)
    if (data.content_rating === 'suggestive') genreNames.push('Suggestive')
    if (data.content_rating === 'erotica') genreNames.push('Erotica')
    if (data.demographic_name) genreNames.push(String(data.demographic_name))
    for (const entry of toArray<any>(data.md_comic_md_genres)) {
        const name = String(entry?.md_genres?.name ?? '').trim()
        if (name && !genreNames.includes(name)) genreNames.push(name)
    }

    const tags: Tag[] = genreNames.map(name => App.createTag({ id: name, label: name }))

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles,
            image: data.default_thumbnail || '',
            status: parseStatus(Number(data.status), data.translation_completed),
            author: toArray<any>(data.authors).map((a: any) => a?.name).filter(Boolean).join(', ') || 'Unknown',
            artist: toArray<any>(data.artists).map((a: any) => a?.name).filter(Boolean).join(', ') || 'Unknown',
            desc: stripHtml(data.desc || ''),
            tags: [
                App.createTagSection({
                    id: 'genres',
                    label: 'Genres',
                    tags
                })
            ]
        })
    })
}

// Chapter ids double as the reader path segment: <hid>-chapter-<chap>-<lang>
export const buildChapterId = (chapter: any): string =>
    `${chapter.hid}-chapter-${chapter.chap}-${chapter.lang}`

export const parseChapterList = (chapters: any[], mangaId: string): Chapter[] => {
    const parsed: Chapter[] = []
    const seen = new Set<string>()
    let sortingIndex = 0

    for (const chapter of toArray<any>(chapters)) {
        if (!chapter?.hid) continue

        const id = buildChapterId(chapter)
        if (seen.has(id)) continue
        seen.add(id)

        const chapNum = Number(String(chapter.chap ?? '').match(/\d+(?:\.\d+)?/)?.[0] ?? 0)
        const groups = toArray<string>(chapter.group_name).filter(Boolean).join(', ')

        let name = `Chapter ${chapter.chap ?? chapNum}`
        if (chapter.title) name += `: ${chapter.title}`

        parsed.push(App.createChapter({
            id,
            chapNum,
            name,
            volume: Number(chapter.vol ?? 0) || 0,
            group: groups,
            langCode: LANGUAGE_FLAGS[String(chapter.lang ?? '')] ?? String(chapter.lang ?? ''),
            time: parseDate(chapter.publish_at || chapter.created_at),
            sortingIndex: sortingIndex--
        }))
    }

    if (parsed.length === 0) {
        throw new Error(`Couldn't find any chapters for ${mangaId} in the selected language — try another language in Source Settings`)
    }

    return parsed
}

export const parseChapterDetails = (html: string, mangaId: string, chapterId: string): ChapterDetails => {
    const data = extractEmbeddedJson(html, 'sv-data')

    const pages: string[] = toArray<any>(data?.chapter?.images)
        .map((image: any) => String(image?.url ?? ''))
        .filter((url: string) => url)

    if (pages.length === 0) {
        throw new Error(`Failed to find any pages for chapter ${chapterId} of ${mangaId}`)
    }

    return App.createChapterDetails({
        id: chapterId,
        mangaId,
        pages
    })
}

// Browse rows come back the same shape from /api/comics/top, /api/chapters/latest
// and /api/search
export const parseMangaList = (items: any[]): PartialSourceManga[] => {
    const results: PartialSourceManga[] = []

    for (const item of toArray<any>(items)) {
        const mangaId = String(item?.slug ?? '')
        if (!mangaId) continue

        // Browse rows expose the latest chapter as `chapter_number`; the top
        // leaderboards carry no chapter info at all, so those stay subtitle-less
        const byLang = item?.chapter_latest_by_langs ?? {}
        const latest = toArray<any>(item?.recent_chapters)[0]?.chapter_number
            ?? Object.keys(byLang).map(key => byLang[key]?.chapter_number).find(Boolean)
            ?? item?.last_chapter

        results.push(App.createPartialSourceManga({
            mangaId,
            image: item?.default_thumbnail || '',
            title: String(item?.title ?? mangaId),
            subtitle: latest ? `Ch. ${latest}` : ''
        }))
    }

    return results
}

export const parseSearchTags = (metadata: any): TagSection[] => {
    const sections: TagSection[] = []
    const genres: Tag[] = []
    const formats: Tag[] = []

    for (const genre of toArray<any>(metadata?.genres)) {
        const slug = String(genre?.slug ?? '')
        const name = String(genre?.name ?? '')
        if (!slug || !name) continue

        const tag = App.createTag({ id: `genre:${slug}`, label: name })
        if (String(genre?.group ?? '') === 'Format') formats.push(tag)
        else genres.push(tag)
    }

    if (genres.length) sections.push(App.createTagSection({ id: 'genres', label: 'Genres', tags: genres }))
    if (formats.length) sections.push(App.createTagSection({ id: 'formats', label: 'Format', tags: formats }))

    sections.push(App.createTagSection({
        id: 'country',
        label: 'Type',
        tags: [
            { id: 'country:jp', label: 'Manga' },
            { id: 'country:kr', label: 'Manhwa' },
            { id: 'country:cn', label: 'Manhua' }
        ].map(tag => App.createTag(tag))
    }))

    sections.push(App.createTagSection({
        id: 'status',
        label: 'Status',
        tags: [
            { id: 'status:1', label: 'Ongoing' },
            { id: 'status:2', label: 'Completed' },
            { id: 'status:3', label: 'Cancelled' },
            { id: 'status:4', label: 'Hiatus' }
        ].map(tag => App.createTag(tag))
    }))

    return sections
}
