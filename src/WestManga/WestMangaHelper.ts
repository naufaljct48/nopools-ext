import {
    HomeSection,
    HomeSectionType,
    Tag
} from '@paperback/types'

import {
    BasicAcceptedElems,
    CheerioAPI
} from 'cheerio'
import { AnyNode } from 'domhandler'

export interface WestMangaHomeSectionData {
    selectorFunc: Function;
    titleSelectorFunc: Function;
    subtitleSelectorFunc: Function;
    getViewMoreItemsFunc: Function;
    section: HomeSection;
    enabled: boolean;
    sortIndex: number;
}

export const DefaultWestMangaHomeSectionData = {
    titleSelectorFunc: ($: CheerioAPI, element: BasicAcceptedElems<AnyNode> | null | undefined) => {
        // For WestManga, extract title from the link within the element
        const linkElement = $('a', element)
        return linkElement.find('p.font-medium').text().trim() || linkElement.attr('title') || ''
    },
    subtitleSelectorFunc: ($: CheerioAPI, element: BasicAcceptedElems<AnyNode> | null | undefined) => {
        // For WestManga, extract chapter info from the card content
        const cardElement = $('div[data-slot="card-content"] p.text-xs', element)
        return cardElement.first().text().trim()
    },
    getViewMoreItemsFunc: () => undefined,
    enabled: true
}

export function createWestMangaHomeSection(id: string, title: string, containsMoreItems = true, type: string = HomeSectionType.singleRowNormal): HomeSection {
    return App.createHomeSection({
        id,
        title,
        type,
        containsMoreItems
    })
}

export function getIncludedTagBySection(section: string, tags: Tag[]): any {
    return (tags?.find((x: Tag) => x.id.startsWith(`${section}:`))?.id.replace(`${section}:`, '') ?? '').replace(' ', '+')
}

export function getFilterTagsBySection(section: string, tags: Tag[], included: boolean, supportsExclusion = false): string[] {
    if (!included && !supportsExclusion) {
        return []
    }

    return tags?.filter((x: Tag) => x.id.startsWith(`${section}:`)).map((x: Tag) => {
        let id: string = x.id.replace(`${section}:`, '')
        if (!included) {
            id = encodeURI(`-${id}`)
        }
        return id
    })
}

// Helper function to extract manga data from WestManga's specific HTML structure
export const extractMangaDataFromElement = (element: any) => {
    const $ = require('cheerio') as any
    const $element = $(element)
    
    // Extract title from the link
    const linkElement = $element.find('a').first()
    const title = linkElement.find('p.font-medium').text().trim() || linkElement.attr('title') || ''
    
    // Extract image (support various attributes)
    const imageElement = $element.find('img').first()
    const image = imageElement.attr('data-src')
        || imageElement.attr('data-lazy-src')
        || (imageElement.attr('srcset') ? imageElement.attr('srcset').split(' ')[0] : '')
        || imageElement.attr('data-cfsrc')
        || imageElement.attr('src')
        || ''
    
    // Extract URL
    const url = linkElement.attr('href') || ''
    
    // Extract chapter info
    const chapterElement = $element.find('div[data-slot="card-content"] p.text-xs').first()
    const chapterInfo = chapterElement.text().trim()
    
    // Extract manga ID from URL
    const mangaId = url.replace(/\/$/, '').split('/').pop() || ''
    
    return {
        title,
        image,
        url,
        mangaId,
        chapterInfo
    }
}

// Helper function to extract chapter data from WestManga's specific HTML structure
export const extractChapterDataFromElement = (element: any) => {
    const $ = require('cheerio') as any
    const $element = $(element)
    
    // Extract chapter link
    const linkElement = $element.find('a').first()
    const url = linkElement.attr('href') || ''
    
    // Extract chapter text
    const chapterText = linkElement.find('p').first().text().trim()
    
    // Extract date
    const dateText = linkElement.find('p.text-xs').text().trim()
    
    // Extract chapter ID from URL (when available, but we'll prefer URL itself)
    const chapterIdMatch = url.match(/chapter-(\d+)-/i)
    const chapterId = chapterIdMatch ? chapterIdMatch[1] : ''
    
    // Extract chapter number
    const chapterNumberMatch = chapterText.match(/chapter\s*(\d+(?:\.\d+)?)/i)
    const chapterNumber = chapterNumberMatch ? parseFloat(chapterNumberMatch[1]) : 0
    
    return {
        url,
        chapterText,
        dateText,
        chapterId,
        chapterNumber
    }
}

// Helper function to parse relative dates like "2 hari", "4 jam"
export const parseRelativeDate = (dateText: string): Date => {
    if (dateText.includes('hari')) {
        const days = parseInt(dateText) || 0
        const date = new Date()
        date.setDate(date.getDate() - days)
        return date
    } else if (dateText.includes('jam')) {
        const hours = parseInt(dateText) || 0
        const date = new Date()
        date.setHours(date.getHours() - hours)
        return date
    } else {
        // Try to parse as a regular date
        return new Date(dateText)
    }
}