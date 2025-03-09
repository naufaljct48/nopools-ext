export interface ShinigamiMeta {
    page: number
    totalPage: number
}

export interface ShinigamiBrowseData {
    mangaId: string
    title: string
    thumbnail: string
}

export interface ShinigamiBrowseResponse {
    data: ShinigamiBrowseData[]
    meta: ShinigamiMeta
}

export interface ShinigamiTaxonomy {
    name: string
}

export interface ShinigamiMangaDetail {
    description: string
    status: number
    taxonomy: {
        Author?: ShinigamiTaxonomy[]
        Artist?: ShinigamiTaxonomy[]
        Genre?: ShinigamiTaxonomy[]
        Format?: ShinigamiTaxonomy[]
    }
}

export interface ShinigamiMangaDetailResponse {
    data: ShinigamiMangaDetail
}

export interface ShinigamiChapter {
    chapterId: string
    name: string
    title: string
    date: string
}

export interface ShinigamiChapterListResponse {
    chapterList: ShinigamiChapter[]
}

export interface ShinigamiPageList {
    chapterPage: {
        path: string
        pages: string[]
    }
}

export interface ShinigamiPageListResponse {
    pageList: ShinigamiPageList
}