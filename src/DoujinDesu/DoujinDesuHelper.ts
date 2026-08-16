import { Request } from '@paperback/types'

export const BASE_URL = 'https://doujin.desu.xxx'
export const API_URL = `${BASE_URL}/api`

// Public app secret shipped inside the site's own JS bundle (assets/index-*.js)
export const APP_SECRET = 'dfdf72051dbfdc7d76889ebd31324e74'

// Response payloads arrive as {"_enc_resp_": "<hex>"} encrypted with a
// time-rotating XOR key derived from this salt (1h windows, tries t-1..t+1)
const KEY_SALT = 'doujindesu-scrapers-cannot-read-this-super-secret-salt-2026-v2'
const KEY_WINDOW_MS = 36e5

// ponytail: UUID v4 via Math.random — server only echoes it back, add crypto.getRandomValues if it ever validates
export const deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
})

export const createRequestObject = (options: { url: string, method?: string, data?: string, headers?: Record<string, string> }): Request => {
    return App.createRequest({
        url: options.url,
        method: (options.method ?? 'GET') as any,
        data: options.data,
        headers: options.headers
    })
}

// Java-style String.hashCode over `${salt}_${window}` → LCG → 32 printable chars
const deriveKey = (window: number): string => {
    const s = `${KEY_SALT}_${window}`
    let l = 0
    for (let i = 0; i < s.length; i++) {
        l = (l << 5) - l + s.charCodeAt(i)
        l |= 0
    }
    let x = Math.abs(l) || 123456789
    let key = ''
    for (let i = 0; i < 32; i++) {
        x = (x * 1664525 + 1013904223) % 4294967296
        key += String.fromCharCode(33 + x % 93)
    }
    return key
}

const xorDecrypt = (payloadHex: string, key: string): string => {
    const bytes: number[] = []
    for (let i = 0; i < payloadHex.length; i += 2) {
        const w = payloadHex.substring(i, i + 2)
        if (w.length < 2) break
        bytes.push(parseInt(w, 16))
    }
    const out: number[] = []
    let rolling = 42
    for (let d = 0; d < bytes.length; d++) {
        const w = bytes[d]
        out.push((w ^ key.charCodeAt(d % key.length) ^ (d * 13) ^ rolling) & 255)
        rolling = (rolling + w) % 256
    }
    // Chunked String.fromCharCode — payloads can be hundreds of KB
    let result = ''
    for (let i = 0; i < out.length; i += 8192) {
        result += String.fromCharCode(...out.slice(i, i + 8192))
    }
    return result
}

export const decryptPayload = (payloadHex: string): any => {
    const window = Math.floor(Date.now() / KEY_WINDOW_MS)
    for (const candidate of [window, window - 1, window + 1]) {
        try {
            return JSON.parse(decodeURIComponent(xorDecrypt(payloadHex, deriveKey(candidate))))
        } catch { /* wrong window key, try next */ }
    }
    throw new Error('Failed to decrypt API response — key salt or scheme likely changed')
}

// Unwraps either a raw JSON body or the encrypted envelope
export const unwrapResponse = (raw: string): any => {
    const data = JSON.parse(raw)
    if (data && typeof data === 'object' && typeof data._enc_resp_ === 'string') {
        return decryptPayload(data._enc_resp_)
    }
    return data
}

export const parseStatus = (value: string): string => {
    switch ((value ?? '').toLowerCase()) {
        case 'ongoing': return 'Ongoing'
        case 'completed': return 'Completed'
        case 'hiatus': return 'Hiatus'
        case 'cancelled':
        case 'dropped': return 'Dropped'
        default: return 'Unknown'
    }
}
