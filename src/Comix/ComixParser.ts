import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { FORMATS, GENRES, parseStatus } from './ComixHelper'

const getImage = (m: any): string => m?.poster?.large || m?.poster?.medium || m?.poster?.small || ''
const clean = (v: any): string => String(v ?? '').trim()

export const parseMangaDetails = (data: any, mangaId: string): SourceManga => {
    const m = data
    const tags: Tag[] = []

    for (const section of ['genres', 'tags', 'demographics', 'formats']) {
        for (const t of (m?.[section] ?? [])) {
            const label = clean(t?.title || t?.name || t?.slug || t)
            const id = clean(t?.slug || label.toLowerCase().replace(/\s+/g, '-'))
            if (id && label) tags.push(App.createTag({ id, label }))
        }
    }

    return App.createSourceManga({
        id: mangaId,
        mangaInfo: App.createMangaInfo({
            titles: [m.title, ...(m.altTitles ?? m.alt_titles ?? [])].filter(Boolean),
            image: getImage(m),
            status: parseStatus(m.status),
            author: (m.authors ?? m.author ?? []).map((x: any) => x.title || x.name).join(', ') || 'Unknown',
            artist: (m.artists ?? m.artist ?? []).map((x: any) => x.title || x.name).join(', ') || 'Unknown',
            desc: m.synopsis || '',
            tags: tags.length ? [App.createTagSection({ id: 'tags', label: 'Tags', tags })] : []
        })
    })
}

/**
 * Parse chapter list dari API response.
 *
 * API response (setelah unwrap):
 * { items: [ { id, number, name, url, group, votes, isOfficial, createdAtFormatted, ... } ], meta/pagination }
 *
 * Deduplicate by chapter number — prefer official, then highest votes, then newest ID.
 */
export const parseChapterList = (data: any): Chapter[] => {
    const items: any[] = data?.items ?? []

    // Deduplicate: keep best version per chapter number
    const bestByNumber = new Map<number, any>()

    for (const c of items) {
        if (!c.id) continue
        const num = Number(c.number ?? 0)
        const existing = bestByNumber.get(num)

        if (!existing) {
            bestByNumber.set(num, c)
        } else {
            // Priority: official > group 10702 > higher votes > newer id
            const isBetter = (() => {
                if (c.isOfficial && !existing.isOfficial) return true
                if (!c.isOfficial && existing.isOfficial) return false
                if (c.group?.id === 10702 && existing.group?.id !== 10702) return true
                if (c.group?.id !== 10702 && existing.group?.id === 10702) return false
                if ((c.votes ?? 0) > (existing.votes ?? 0)) return true
                if ((c.votes ?? 0) < (existing.votes ?? 0)) return false
                return c.id > existing.id
            })()

            if (isBetter) bestByNumber.set(num, c)
        }
    }

    // Sort descending by chapter number
    const sorted = Array.from(bestByNumber.values()).sort((a, b) => (b.number ?? 0) - (a.number ?? 0))

    return sorted.map((c, idx) => {
        const chapNum = Number(c.number ?? 0)
        const name = c.name
            ? `Chapter ${chapNum}: ${c.name}`
            : `Chapter ${chapNum}`

        return App.createChapter({
            id: String(c.id),
            chapNum,
            name,
            langCode: '🇬🇧',
            group: c.group?.name ?? (c.isOfficial ? 'Official' : 'Unknown'),
            volume: Number(c.volume ?? 0) || undefined,
            sortingIndex: idx
        })
    })
}

/**
 * Parse chapter pages dari API response.
 *
 * API response (setelah unwrap):
 * { pages: { baseUrl: "https://...", items: [ { url: "/path/img.jpg" }, ... ] } }
 */
export const parseChapterDetails = (data: any, mangaId: string, chapterId: string): ChapterDetails => {
    const p = data?.pages
    const baseUrl = (p?.baseUrl ?? '').replace(/\/$/, '')
    const pages: string[] = (p?.items ?? []).map((x: any) => {
        const url: string = x?.url ?? ''
        if (url.startsWith('http')) return url
        return `${baseUrl}/${url.replace(/^\//, '')}`
    }).filter((u: string) => u.length > 0)

    if (pages.length === 0) {
        throw new Error('[Comix] No pages found for this chapter. Token might be expired.')
    }

    return App.createChapterDetails({ id: chapterId, mangaId, pages })
}

export const parseMangaList = (data: any): PartialSourceManga[] => {
    const items: any[] = data?.items ?? (Array.isArray(data) ? data : [])
    return items.map((m: any) => App.createPartialSourceManga({
        mangaId: m.hid || String(m.id),
        image: getImage(m),
        title: m.title || '',
        subtitle: m.latestChapter ? `Ch. ${m.latestChapter}` : (m.type || '')
    }))
}

export const parseSearchTags = (): TagSection[] => [
    App.createTagSection({
        id: 'genres',
        label: 'Genres',
        tags: GENRES.map(g => App.createTag({ id: `genres_in:${g.id}`, label: g.label }))
    }),
    App.createTagSection({
        id: 'formats',
        label: 'Formats',
        tags: FORMATS.map(f => App.createTag({ id: `genres_in:${f.id}`, label: f.label }))
    }),
    App.createTagSection({
        id: 'type',
        label: 'Type',
        tags: [
            { id: 'types:manga', label: 'Manga' },
            { id: 'types:manhwa', label: 'Manhwa' },
            { id: 'types:manhua', label: 'Manhua' },
            { id: 'types:other', label: 'Other' },
        ].map(x => App.createTag(x))
    }),
    App.createTagSection({
        id: 'status',
        label: 'Status',
        tags: [
            { id: 'statuses:releasing', label: 'Releasing' },
            { id: 'statuses:finished', label: 'Completed' },
            { id: 'statuses:on_hiatus', label: 'Hiatus' },
            { id: 'statuses:discontinued', label: 'Discontinued' },
        ].map(x => App.createTag(x))
    }),
    App.createTagSection({
        id: 'content_rating',
        label: 'Content Rating',
        tags: [
            { id: 'content_rating:safe', label: 'Safe' },
            { id: 'content_rating:suggestive', label: 'Suggestive' },
            { id: 'content_rating:erotica', label: 'Erotica' },
            { id: 'content_rating:pornographic', label: 'Pornographic' },
        ].map(x => App.createTag(x))
    }),
]
