import { Request } from '@paperback/types'

export const BASE_URL = 'https://13.voratoon.com'
export const FALLBACK_BASES = [
    'https://13.voratoon.com',
    'https://voratoon.co'
]
export const PORTAL_URL = 'https://voratoon.id/'

// Next.js Server Action hashes (auto-refreshed from chunks if rotated)
export const DEFAULT_RUN_API_ACTION = '405a35a66edd5e9e3fa2d903049435d5a3f9aaad0b'
export const DEFAULT_UNLOCK_PAGES_ACTION = '603e8cd8a82ce1bd958c99197d5816de779f853c41'

// Covers are presigned S3 links on this host; page images live on cdn.voratoon.com unsigned
export const PRESIGN_HOST = 'cvr.voratoon.id'

export const createRequestObject = (requestObj: any, baseUrl: string = BASE_URL): Request => {
    const isImage = /\.(png|jpe?g|webp|gif|avif)$/i.test((requestObj.url || '').split('?')[0] ?? '')

    const headers: Record<string, string> = {
        'Accept': isImage
            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            : 'application/json, text/plain, */*',
        'Referer': `${baseUrl}/`,
        'Origin': baseUrl,
        'Sec-GPC': '1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }

    return App.createRequest({
        ...requestObj,
        headers: {
            ...headers,
            ...(requestObj.headers ?? {})
        }
    })
}

export const parseStatus = (status: string): string => {
    switch ((status ?? '').toLowerCase()) {
        case 'ongoing': return 'Ongoing'
        case 'completed': return 'Completed'
        case 'hiatus': return 'Hiatus'
        case 'cancelled':
        case 'dropped': return 'Dropped'
        default: return 'Unknown'
    }
}

export const parseDate = (dateStr: string): Date => {
    if (!dateStr) return new Date()
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? new Date() : date
}

// Synopsis comes back as CMS HTML — Paperback renders the raw markup otherwise
export const stripHtml = (raw: string): string => {
    if (!raw) return ''
    return raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;|&apos;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

// Presigned covers die after X-Amz-Expires seconds (86400 today), so a URL the app
// cached in an earlier session points at a dead signature.
export const isPresignExpired = (url: string): boolean => {
    const signedAt = url.match(/X-Amz-Date=(\d{8}T\d{6}Z)/)?.[1]
    const lifetime = Number(url.match(/X-Amz-Expires=(\d+)/)?.[1] ?? 0)
    if (!signedAt || !lifetime) return false

    const iso = `${signedAt.slice(0, 4)}-${signedAt.slice(4, 6)}-${signedAt.slice(6, 8)}T${signedAt.slice(9, 11)}:${signedAt.slice(11, 13)}:${signedAt.slice(13, 15)}Z`
    const expiresAt = Date.parse(iso) + lifetime * 1000
    if (isNaN(expiresAt)) return false

    return Date.now() >= expiresAt - 60 * 1000
}

// Parse Next.js Server Action Flight response, resolving `<id>:T<hexLen>,<text>` refs (`"$2"`)
export const parseFlightPayload = (raw: string): any => {
    const text = String(raw ?? '')
    const textRefs: Record<string, string> = {}
    const parsedChunks: Record<string, any> = {}

    let pos = 0
    while (pos < text.length) {
        const colon = text.indexOf(':', pos)
        if (colon < 0) break
        const id = text.slice(pos, colon).trim()
        const after = colon + 1
        if (after >= text.length) break

        // Flight large text chunk: `<id>:T<hexByteLen>,<utf8 text>` (ASCII base64url tickets match char len)
        if (text[after] === 'T') {
            const comma = text.indexOf(',', after + 1)
            if (comma < 0) break
            const hexLen = parseInt(text.slice(after + 1, comma), 16)
            if (!isNaN(hexLen) && hexLen >= 0) {
                const start = comma + 1
                textRefs[`$${id}`] = text.slice(start, start + hexLen)
                pos = start + hexLen
                if (text[pos] === '\n') pos++
                continue
            }
        }

        const nl = text.indexOf('\n', after)
        const lineEnd = nl < 0 ? text.length : nl
        const payload = text.slice(after, lineEnd).trim()
        pos = nl < 0 ? text.length : nl + 1

        if (payload.startsWith('[') || payload.startsWith('{')) {
            try {
                parsedChunks[id] = JSON.parse(payload)
            } catch {
                // Ignore non-JSON flight frames
            }
        }
    }

    const resolveRefs = (val: any): any => {
        if (typeof val === 'string' && textRefs[val] !== undefined) return textRefs[val]
        if (Array.isArray(val)) return val.map(resolveRefs)
        if (val && typeof val === 'object') {
            const out: Record<string, any> = {}
            for (const k of Object.keys(val)) out[k] = resolveRefs(val[k])
            return out
        }
        return val
    }

    // Prefer chunk '1' (standard Next.js server action return slot)
    if (parsedChunks['1'] !== undefined) {
        return resolveRefs(parsedChunks['1'])
    }
    for (const k of Object.keys(parsedChunks)) {
        if (k === '0') continue
        return resolveRefs(parsedChunks[k])
    }
    return null
}

export const parseFlightResult = (raw: string): any => {
    const payload = parseFlightPayload(raw)
    if (Array.isArray(payload) && payload.length > 0 && payload[0] && typeof payload[0] === 'object' && 'ok' in payload[0]) {
        return payload[0]
    }
    return null
}
