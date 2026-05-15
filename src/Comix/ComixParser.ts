import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { parseStatus } from './ComixHelper'

const getImage = (m: any): string => m?.poster?.large || m?.poster?.medium || ''
const clean = (v: any): string => String(v ?? '').trim()

export const parseMangaDetails = (data: any, mangaId: string): SourceManga => {
    const m = data
    const tags: Tag[] = []
    for (const section of ['genres', 'tags', 'demographics', 'formats']) {
        for (const t of (m?.[section] ?? [])) {
            const label = clean(t?.name || t?.title || t?.slug || t)
            const id = clean(t?.slug || label.toLowerCase().replace(/\s+/g, '-'))
            if (id && label) tags.push(App.createTag({ id, label }))
        }
    }

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles: [m.title, ...(m.altTitles ?? [])].filter(Boolean),
            image: getImage(m),
            status: parseStatus(m.status),
            author: (m.authors ?? []).map((x: any) => x.name).join(', ') || 'Unknown',
            artist: (m.artists ?? []).map((x: any) => x.name).join(', ') || 'Unknown',
            desc: m.synopsis || '',
            tags: tags.length ? [App.createTagSection({ id: 'tags', label: 'Tags', tags })] : []
        })
    })
}

export const parseChapterList = (data: any): Chapter[] => {
    const chapters: Chapter[] = []
    const seen = new Set<string>()
    let sortingIndex = 0

    for (const c of (data?.items ?? [])) {
        const id = String(c.id ?? '')
        if (!id || seen.has(id)) continue
        seen.add(id)
        chapters.push(App.createChapter({
            id,
            chapNum: Number(c.number ?? 0),
            name: c.name || `Chapter ${c.number}`,
            langCode: c.language === 'en' ? '🇬🇧' : c.language,
            group: c.group?.name ?? '',
            volume: Number(c.volume ?? 0),
            sortingIndex: sortingIndex--
        }))
    }

    return chapters
}

export const parseChapterDetails = (data: any, mangaId: string, chapterId: string): ChapterDetails => {
    const p = data?.pages
    const pages = (p?.items ?? []).map((x: any) => `${p.baseUrl}${x.url}`)
    return App.createChapterDetails({ id: chapterId, mangaId, pages })
}

export const parseMangaList = (data: any): PartialSourceManga[] => (data?.items ?? data ?? []).map((m: any) => App.createPartialSourceManga({
    mangaId: m.hid || String(m.id),
    image: getImage(m),
    title: m.title || '',
    subtitle: m.latestChapter ? `Ch. ${m.latestChapter}` : (m.type || '')
}))

export const parseSearchTags = (): TagSection[] => [
    App.createTagSection({
        id: 'type',
        label: 'Type',
        tags: ['manga', 'manhwa', 'manhua'].map(x => App.createTag({ id: `type:${x}`, label: x }))
    }),
    App.createTagSection({
        id: 'status',
        label: 'Status',
        tags: [
            { id: 'status:releasing', label: 'Releasing' },
            { id: 'status:completed', label: 'Completed' },
            { id: 'status:on_hiatus', label: 'Hiatus' }
        ].map(x => App.createTag(x))
    })
]
