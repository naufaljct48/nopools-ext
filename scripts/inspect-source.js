#!/usr/bin/env node
/**
 * Live content inspector: calls a source's real methods and PRINTS what comes back,
 * so the data can be eyeballed instead of trusting a green pass/fail line.
 *
 * Usage:
 *   npx tsc --outDir tmp
 *   node scripts/inspect-source.js <SourceClass> [genreTagId]
 */
require('@paperback/runtime-polyfills')
const cheerio = require('cheerio')
const path = require('path')

const name = process.argv[2]
const genreTagId = process.argv[3]
if (!name) {
    console.error('usage: node scripts/inspect-source.js <SourceClass> [genreTagId]')
    process.exit(1)
}

const mod = require(path.resolve('tmp', name, `${name}.js`))
const source = new mod[name](cheerio)

const line = (label, value) => console.log(`  ${label.padEnd(16)} ${value}`)
const trunc = (value, n = 90) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim()
    return text.length > n ? `${text.slice(0, n)}…` : text
}

const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT after ${ms}ms in ${label}`)), ms))
])

async function headCheck(url) {
    try {
        const request = App.createRequest({ url, method: 'GET', headers: { Referer: `${(source.baseUrl || '')}/` } })
        const response = await source.requestManager.schedule(request, 1)
        const size = typeof response.rawData?.toString === 'function'
            ? Buffer.byteLength(String(response.data ?? ''), 'binary')
            : String(response.data ?? '').length
        return `HTTP ${response.status} (~${size} bytes)`
    } catch (error) {
        return `FETCH FAILED: ${error.message}`
    }
}

;(async () => {
    console.log(`\n================ ${name} ================`)

    // ---- home pages ----
    console.log('\n[HOME PAGE SECTIONS]')
    const sections = new Map()
    await withTimeout(source.getHomePageSections(s => sections.set(s.id, s)), 120000, 'getHomePageSections')
    let firstMangaId = null
    for (const [id, section] of sections) {
        const items = section.items ?? []
        if (!firstMangaId && items.length) firstMangaId = items[0].mangaId
        line(id, `${String(items.length).padStart(3)} items  "${section.title}"  [${section.type}]`)
        for (const item of items.slice(0, 2)) {
            console.log(`      · ${trunc(item.title, 46).padEnd(48)} sub="${trunc(item.subtitle, 22)}"  id=${item.mangaId}`)
            console.log(`        img=${trunc(item.image, 96)}`)
        }
        if (items.length === 0) console.log('      !! EMPTY SECTION')
    }

    // ---- view more (pagination sanity) ----
    const pageable = [...sections.values()].find(s => s.containsMoreItems)
    if (pageable) {
        console.log(`\n[VIEW MORE] section=${pageable.id}`)
        try {
            const p1 = await withTimeout(source.getViewMoreItems(pageable.id, { page: 1 }), 60000, 'viewMore p1')
            const p2 = p1?.metadata
                ? await withTimeout(source.getViewMoreItems(pageable.id, p1.metadata), 60000, 'viewMore p2')
                : null
            const ids1 = new Set((p1?.results ?? []).map(r => r.mangaId))
            const ids2 = (p2?.results ?? []).map(r => r.mangaId)
            const overlap = ids2.filter(id => ids1.has(id)).length
            line('page 1', `${ids1.size} items, next=${JSON.stringify(p1?.metadata)}`)
            line('page 2', p2 ? `${ids2.length} items, overlap with p1 = ${overlap} ${overlap ? '!! PAGINATION LOOP' : '(disjoint OK)'}` : '(no next page)')
        } catch (error) {
            console.log(`  !! ${error.message}`)
        }
    }

    // ---- manga details ----
    console.log(`\n[MANGA DETAILS] mangaId=${firstMangaId}`)
    const details = await withTimeout(source.getMangaDetails(firstMangaId), 60000, 'getMangaDetails')
    const info = details.mangaInfo
    line('titles', JSON.stringify(info.titles))
    line('status', info.status)
    line('author', `${info.author} / artist: ${info.artist}`)
    line('image', trunc(info.image, 96))
    line('image fetch', await headCheck(info.image))
    const genres = (info.tags ?? []).flatMap(t => (t.tags ?? []).map(x => x.label))
    line('genres', `${genres.length} → ${trunc(genres.join(', '), 110)}`)
    line('desc', `${(info.desc || '').length} chars → ${trunc(info.desc, 110)}`)
    if (/<[a-z][^>]*>/i.test(info.desc || '')) console.log('      !! DESC CONTAINS RAW HTML')
    if (!genres.length) console.log('      !! NO GENRES PARSED')

    // ---- chapter list ----
    console.log('\n[CHAPTER LIST]')
    const chapters = await withTimeout(source.getChapters(firstMangaId), 60000, 'getChapters')
    line('count', chapters.length)
    for (const chapter of [chapters[0], chapters[1], chapters[chapters.length - 1]].filter(Boolean)) {
        console.log(`      · id=${String(chapter.id).padEnd(12)} num=${String(chapter.chapNum).padEnd(7)} time=${new Date(chapter.time).toISOString().slice(0, 10)}  lang=${chapter.langCode}  "${trunc(chapter.name, 36)}"`)
    }
    const badDates = chapters.filter(c => isNaN(new Date(c.time).getTime())).length
    const sameDay = new Set(chapters.map(c => new Date(c.time).toISOString().slice(0, 10))).size
    line('date sanity', `${badDates} invalid, ${sameDay} distinct days across ${chapters.length} chapters${sameDay === 1 && chapters.length > 3 ? '  !! all same day (dates likely unparsed)' : ''}`)

    // ---- chapter details ----
    console.log(`\n[CHAPTER DETAILS] chapterId=${chapters[0].id}`)
    const chapterDetails = await withTimeout(source.getChapterDetails(firstMangaId, chapters[0].id), 60000, 'getChapterDetails')
    line('pages', chapterDetails.pages.length)
    chapterDetails.pages.slice(0, 3).forEach((page, i) => console.log(`      ${i + 1}. ${trunc(page, 104)}`))
    line('page 1 fetch', await headCheck(chapterDetails.pages[0]))
    const dupes = chapterDetails.pages.length - new Set(chapterDetails.pages).size
    if (dupes) console.log(`      !! ${dupes} duplicate page urls`)

    // ---- tags ----
    console.log('\n[SEARCH TAGS]')
    const tagSections = await withTimeout(source.getSearchTags(), 60000, 'getSearchTags')
    for (const section of tagSections) {
        line(section.id, `${section.tags.length} tags → ${trunc(section.tags.slice(0, 6).map(t => `${t.label}(${t.id})`).join(', '), 110)}`)
    }

    // ---- search ----
    console.log('\n[SEARCH]')
    const textQuery = { title: 'a', includedTags: [], excludedTags: [] }
    const textResults = await withTimeout(source.getSearchResults(textQuery, {}), 60000, 'search text')
    line('text "a"', `${textResults.results.length} results, next=${JSON.stringify(textResults.metadata)}`)
    textResults.results.slice(0, 3).forEach(r => console.log(`      · ${trunc(r.title, 50).padEnd(52)} id=${r.mangaId}`))

    if (genreTagId) {
        const tag = tagSections.flatMap(s => s.tags).find(t => t.id === genreTagId)
        const genreQuery = { title: '', includedTags: [tag ?? { id: genreTagId, label: genreTagId }], excludedTags: [] }
        const genreResults = await withTimeout(source.getSearchResults(genreQuery, {}), 60000, 'search genre')
        line(`genre ${genreTagId}`, `${genreResults.results.length} results`)
        genreResults.results.slice(0, 3).forEach(r => console.log(`      · ${trunc(r.title, 50).padEnd(52)} id=${r.mangaId}`))

        // does the filter actually filter? compare against the unfiltered list
        const baseline = await withTimeout(source.getSearchResults({ title: '', includedTags: [], excludedTags: [] }, {}), 60000, 'search baseline')
        const baseIds = (baseline.results ?? []).map(r => r.mangaId).slice(0, 10).join(',')
        const genreIds = (genreResults.results ?? []).map(r => r.mangaId).slice(0, 10).join(',')
        line('filter effect', baseIds === genreIds ? '!! IDENTICAL to unfiltered results — filter ignored' : 'differs from unfiltered (filter applied)')

        // verify the genre actually appears on a returned title
        if (genreResults.results.length) {
            const check = await withTimeout(source.getMangaDetails(genreResults.results[0].mangaId), 60000, 'genre verify')
            const found = (check.mangaInfo.tags ?? []).flatMap(t => t.tags.map(x => x.label.toLowerCase()))
            const wanted = String(tag?.label ?? genreTagId).toLowerCase()
            line('genre verify', `"${check.mangaInfo.titles[0]}" genres=[${trunc(found.join(', '), 70)}] contains "${wanted}"? ${found.includes(wanted) ? 'YES' : 'NO'}`)
        }
    }

    console.log(`\n================ ${name} done ================\n`)
})().catch(error => {
    console.error(`\n!!! ${name} FAILED: ${error.message}`)
    console.error(error.stack?.split('\n').slice(1, 4).join('\n'))
    process.exit(1)
})
