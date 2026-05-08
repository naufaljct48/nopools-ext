import { Request } from '@paperback/types'

const WEBSITE_BASE = 'https://westmanga.co'
const isApiUrl = (url: string): boolean => /data\.mantweh\.online\/api/i.test(url)

const ACCESS_KEY = 'WM_WEB_FRONT_END'
const SECRET_KEY = 'xxxoidj'
const SIGNATURE_MESSAGE = 'wm-api-request'

const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]

const rightRotate = (value: number, amount: number): number => (value >>> amount) | (value << (32 - amount))

const utf8ToBytes = (text: string): number[] => {
    const bytes: number[] = []
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i)
        if (code < 0x80) bytes.push(code)
        else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
        else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
    return bytes
}

const sha256 = (input: number[]): number[] => {
    const bytes = input.slice()
    const bitLength = bytes.length * 8
    const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

    bytes.push(0x80)
    while ((bytes.length % 64) !== 56) bytes.push(0)

    const high = Math.floor(bitLength / 0x100000000)
    const low = bitLength >>> 0
    bytes.push((high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff)
    bytes.push((low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff)

    for (let offset = 0; offset < bytes.length; offset += 64) {
        const w = new Array<number>(64)
        for (let i = 0; i < 16; i++) {
            const j = offset + i * 4
            w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3)
            const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10)
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
        }

        let a = hash[0]
        let b = hash[1]
        let c = hash[2]
        let d = hash[3]
        let e = hash[4]
        let f = hash[5]
        let g = hash[6]
        let h = hash[7]

        for (let i = 0; i < 64; i++) {
            const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)
            const ch = (e & f) ^ (~e & g)
            const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0
            const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)
            const maj = (a & b) ^ (a & c) ^ (b & c)
            const temp2 = (s0 + maj) >>> 0
            h = g
            g = f
            f = e
            e = (d + temp1) >>> 0
            d = c
            c = b
            b = a
            a = (temp1 + temp2) >>> 0
        }

        hash[0] = (hash[0] + a) >>> 0
        hash[1] = (hash[1] + b) >>> 0
        hash[2] = (hash[2] + c) >>> 0
        hash[3] = (hash[3] + d) >>> 0
        hash[4] = (hash[4] + e) >>> 0
        hash[5] = (hash[5] + f) >>> 0
        hash[6] = (hash[6] + g) >>> 0
        hash[7] = (hash[7] + h) >>> 0
    }

    const output: number[] = []
    for (const value of hash) output.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff)
    return output
}

const bytesToHex = (bytes: number[]): string => bytes.map((byte) => (`0${byte.toString(16)}`).slice(-2)).join('')

const hmacSha256 = (message: string, key: string): string => {
    let keyBytes = utf8ToBytes(key)
    if (keyBytes.length > 64) keyBytes = sha256(keyBytes)
    while (keyBytes.length < 64) keyBytes.push(0)

    const innerKey = keyBytes.map((byte) => byte ^ 0x36)
    const outerKey = keyBytes.map((byte) => byte ^ 0x5c)
    const innerHash = sha256(innerKey.concat(utf8ToBytes(message)))
    return bytesToHex(sha256(outerKey.concat(innerHash)))
}

const generateSignature = (urlPath: string, method: string, timestamp: string): string => {
    const key = timestamp + method + urlPath + ACCESS_KEY + SECRET_KEY
    return hmacSha256(SIGNATURE_MESSAGE, key)
}

export const createRequestObject = (requestObj: any): Request => {
    const url: string = requestObj?.url ?? ''
    const isImage = /(\.(png|jpe?g|webp|gif)$)|storage\./i.test(url)
    const api = isApiUrl(url)

    const accept = api
        ? 'application/json,*/*;q=0.8'
        : (isImage
            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')

    const defaultHeaders: Record<string, string> = {
        'Accept': accept,
        'Origin': WEBSITE_BASE,
        'Referer': `${WEBSITE_BASE}/`,
        'DNT': '1',
        'Sec-GPC': '1',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }

    if (api) {
        const now = Math.floor(Date.now() / 1000).toString()
        const method = requestObj.method?.toUpperCase() || 'GET'
        
        const withoutProtocol = url.replace(/^https?:\/\//, '')
        const pathStart = withoutProtocol.indexOf('/')
        const urlPath = pathStart !== -1 ? withoutProtocol.substring(pathStart).split('?')[0].split('#')[0] : '/'
        
        defaultHeaders['x-wm-accses-key'] = ACCESS_KEY
        defaultHeaders['x-wm-request-time'] = now
        defaultHeaders['x-wm-request-signature'] = generateSignature(urlPath, method, now)
    }

    const extraHeadersObj = requestObj.headers ?? {}
    const extraHeaders: Record<string, string> = {}
    for (const k of Object.keys(extraHeadersObj)) {
        const v = extraHeadersObj[k]
        if (typeof v === 'string') extraHeaders[k] = v
    }

    return App.createRequest({
        ...requestObj,
        headers: {
            ...defaultHeaders,
            ...extraHeaders
        }
    })
}

// Mendapatkan sumber gambar dari berbagai atribut yang umum digunakan
export const getImageSrc = (imgEl: any): string => {
    const $ = require('cheerio') as any
    const $img = $(imgEl)
    const srcset: string | undefined = $img.attr('srcset') ?? undefined

    const srcComputed: string =
        ($img.attr('data-src') ?? '') ||
        ($img.attr('data-lazy-src') ?? '') ||
        (srcset ? (srcset.split(' ')[0] ?? '') : '') ||
        ($img.attr('data-cfsrc') ?? '') ||
        ($img.attr('src') ?? '') ||
        ''

    let src = srcComputed || ''
    const resizeIdx = src.indexOf('?resize')
    if (resizeIdx >= 0) src = src.substring(0, resizeIdx)
    src = (src || '').replace(/^\/\//, 'https://').replace(/^\//, 'https:/')
    return encodeURI(decodeURI((src || '').trim()))
}

// Ekstraksi data manga dari kartu (homepage, contents)
export const extractMangaDataFromElement = (element: any) => {
    const $ = require('cheerio') as any
    const $el = $(element)

    const link = $el.find('a').first()
    const title = link.find('p.font-medium').text().trim() || link.attr('title') || ''
    const image = getImageSrc($el.find('img').first())
    const url = link.attr('href') || ''

    const chapterInfo = $el.find('div[data-slot="card-content"] p.text-xs').first().text().trim()
    const mangaId = url.replace(/\/$/, '').split('/').pop() || ''

    return { title, image, url, mangaId, chapterInfo }
}

// Ekstraksi data chapter dari elemen list chapter di halaman detail
export const extractChapterDataFromElement = (element: any) => {
    const $ = require('cheerio') as any
    const $el = $(element)

    const link = $el.find('a').first()
    const url = link.attr('href') || ''
    const chapterText = link.find('p').first().text().trim()
    const dateText = link.find('p.text-xs').text().trim()
    const numMatch = chapterText.match(/chapter\s*(\d+(?:\.\d+)?)/i)
    const chapterNumber = numMatch ? parseFloat(numMatch[1]) : 0

    return { url, chapterText, dateText, chapterNumber }
}

// Parsing tanggal relatif seperti "2 hari" atau "4 jam"
export const parseRelativeDate = (dateText: string): Date => {
    if (!dateText) return new Date()
    const lower = dateText.toLowerCase()
    if (lower.includes('hari')) {
        const days = parseInt(lower) || 0
        const d = new Date(); d.setDate(d.getDate() - days); return d
    }
    if (lower.includes('jam')) {
        const hours = parseInt(lower) || 0
        const d = new Date(); d.setHours(d.getHours() - hours); return d
    }
    return new Date(dateText)
}
