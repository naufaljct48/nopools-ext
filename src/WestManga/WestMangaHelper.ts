import { Request } from '@paperback/types'

const BASE_URL = 'https://westmanga.me'

export const createRequestObject = (requestObj: any): Request => {
    const url: string = requestObj?.url ?? ''
    const isImage = /(\.(png|jpe?g|webp|gif)$)|storage\./i.test(url)

    const defaultHeaders: Record<string, string> = {
        'Accept': isImage
            ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Origin': BASE_URL,
        'Referer': `${BASE_URL}/`,
        'DNT': '1',
        'Sec-GPC': '1',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
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
    const srcset: string | undefined = $img.attr('srcset')
    let src: string = $img.attr('data-src')
        || $img.attr('data-lazy-src')
        || (srcset ? srcset.split(' ')[0] : '')
        || $img.attr('data-cfsrc')
        || $img.attr('src')
        || ''

    src = (src || '').split('?resize')[0]
    src = src.replace(/^\/\//, 'https://').replace(/^\//, 'https:/')
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