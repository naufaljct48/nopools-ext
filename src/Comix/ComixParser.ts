import { Chapter, ChapterDetails, PartialSourceManga, SourceManga, Tag, TagSection } from '@paperback/types'
import { BASE_URL, FORMATS, GENRES, parseStatus } from './ComixHelper'

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
            titles: [m.title, ...(m.altTitles ?? [])].filter(Boolean),
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
 * Parse chapter list dari API response (butuh token _).
 * Response format:
 * { status:'ok', result: { items: [ { id, number, name, url, group, votes, ... } ] } }
 */
export const parseChapterList = (data: any): Chapter[] => {
    const chapters: Chapter[] = []
    const seen = new Set<string>()
    let sortingIndex = 0

    const items: any[] = data?.items ?? []

    for (const c of items) {
        const id = String(c.id ?? '')
        if (!id || seen.has(id)) continue
        seen.add(id)

        const chapNum = Number(c.number ?? 0)
        const name = c.name ? `Chapter ${chapNum}: ${c.name}` : `Chapter ${chapNum}`

        // Simpan URL asli dari API untuk bisa extract chapter ID nanti
        // Format: /title/{mangaSlug}/{chapterId}-chapter-{num}
        chapters.push(App.createChapter({
            id,
            chapNum,
            name,
            langCode: '🇬🇧',
            group: c.group?.name ?? (c.isOfficial ? 'Official' : 'Unknown'),
            volume: Number(c.volume ?? 0) || undefined,
            sortingIndex: sortingIndex--
        }))
    }

    return chapters
}

/**
 * Parse chapter list dari HTML halaman manga.
 * Dipakai sebagai fallback kalau token API expired.
 * Chapter links ada di rendered HTML: /title/{slug}/{id}-chapter-{num}
 */
export const parseChapterListFromHtml = (html: string, mangaId: string): Chapter[] => {
    const chapters: Chapter[] = []
    const seen = new Set<string>()
    let sortingIndex = 0

    // Match semua chapter links dari HTML
    // Format: href="/title/5zd17-slug/9396458-chapter-83"
    const regex = /href="\/title\/[^"]*\/(\d+)-chapter-([\d.]+)"[^>]*>[\s\S]*?<\/a>/gi
    const simpleRegex = /\/title\/[^"]+\/(\d+)-chapter-([\d.]+)/g

    let match
    while ((match = simpleRegex.exec(html)) !== null) {
        const id = match[1] ?? ''
        const chapNum = parseFloat(match[2] ?? '0')
        if (!id || seen.has(id) || isNaN(chapNum)) continue
        seen.add(id)

        chapters.push(App.createChapter({
            id,
            chapNum,
            name: `Chapter ${chapNum}`,
            langCode: '🇬🇧',
            sortingIndex: sortingIndex--
        }))
    }

    return chapters
}

export const parseChapterDetails = (data: any, mangaId: string, chapterId: string): ChapterDetails => {
    const p = data?.pages
    const baseUrl = (p?.baseUrl ?? '').replace(/\/$/, '')
    const pages: string[] = (p?.items ?? []).map((x: any) => {
        const url = x?.url ?? ''
        if (url.startsWith('http')) return url
        return `${baseUrl}/${url.replace(/^\//, '')}`
    })
    return App.createChapterDetails({ id: chapterId, mangaId, pages })
}

/**
 * Parse chapter pages dari HTML halaman chapter (initial-data script tag).
 * Dipakai sebagai fallback kalau token API expired.
 */
export const parseChapterDetailsFromHtml = (html: string, mangaId: string, chapterId: string): ChapterDetails => {
    // Coba ambil dari initial-data JSON
    const initialDataMatch = html.match(/id="initial-data">({.+?})<\/script>/s)
    if (initialDataMatch) {
        try {
            const data = JSON.parse(initialDataMatch[1] ?? '{}')
            // Cari query yang berisi pages
            for (const key of Object.keys(data.queries ?? {})) {
                const val = data.queries[key]
                if (val?.pages || val?.images) {
                    const pages: string[] = val.pages ?? val.images ?? []
                    if (pages.length > 0) {
                        return App.createChapterDetails({ id: chapterId, mangaId, pages })
                    }
                }
            }
        } catch {
            // ignore parse error
        }
    }

    // Fallback: cari image URLs dari HTML
    const imgRegex = /https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^"'\s]*)?/gi
    const pages: string[] = []
    const seen = new Set<string>()
    let match
    while ((match = imgRegex.exec(html)) !== null) {
        const url = match[0]
        // Filter hanya URL yang kemungkinan adalah page image (bukan thumbnail/icon)
        if (!seen.has(url) && (url.includes('storage.') || url.includes('/pages/') || url.includes('/chapter'))) {
            seen.add(url)
            pages.push(url)
        }
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
