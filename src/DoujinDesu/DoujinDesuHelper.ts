import * as cheerio from 'cheerio'
import { Element } from 'domhandler'

const BASE_URL = 'https://doujindesu.tv'

export const MONTHS: Record<string, number> = {
    januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
    juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11
}

export const TYPES = ['Doujinshi', 'Manga', 'Manhwa']

export const absoluteUrl = (url: string): string => {
    if (!url) return ''
    if (url.startsWith('http')) return url
    if (url.startsWith('//')) return `https:${url}`
    if (url.startsWith('/')) return `${BASE_URL}${url}`
    return `${BASE_URL}/${url}`
}

export const slugFromUrl = (url: string): string =>
    absoluteUrl(url).replace(/\/$/, '').split('/').pop() ?? ''

export const imageFromElement = ($: cheerio.CheerioAPI, element: cheerio.Cheerio<Element>): string => {
    const srcset = element.attr('srcset') ?? ''
    return absoluteUrl(
        element.attr('data-src')
        || element.attr('data-lazy-src')
        || srcset.split(' ')[0]
        || element.attr('src')
        || ''
    )
}

export const parseDate = (value: string): Date => {
    const match = value.toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i)
    if (!match) return new Date()
    const day = Number(match[1] ?? '1')
    const month = MONTHS[match[2] ?? ''] ?? 0
    const year = Number(match[3] ?? new Date().getFullYear())
    return new Date(year, month, day)
}

export const parseStatus = (value: string): string => {
    const lower = value.toLowerCase()
    if (lower.includes('finished') || lower.includes('completed')) return 'Completed'
    if (lower.includes('publishing') || lower.includes('ongoing')) return 'Ongoing'
    return 'Unknown'
}

export const getTableValue = ($: cheerio.CheerioAPI, label: string): string =>
    $(`section.metadata td:contains(${label})`)
        .filter((_, el) => $(el).text().trim() === label)
        .first().next('td').text().trim().replace(/\s+/g, ' ')

export const hasNextPage = ($: cheerio.CheerioAPI): boolean =>
    $('nav.pagination li.last a').length > 0 || $('a.next.page-numbers').length > 0
