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
    retcode: number
    message: string
    meta: {
        page: number
        page_size: number
        total_page: number
        total_record: number
    }
    data: {
        manga_id: string
        title: string
        alternative_title?: string
        cover_image_url: string
        cover_portrait_url: string
        description?: string
        status?: number
        bookmark_count?: number
        view_count?: number
        user_rate?: number
    }[]
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