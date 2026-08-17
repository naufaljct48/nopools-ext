#!/usr/bin/env node
/**
 * Evaluates every final bundle inside a restricted sandbox that mimics the
 * Paperback iOS JS runtime: no Buffer, no URLSearchParams, no fetch, no process.
 *
 * A bundle that throws here dies identically on-device, even when
 * `npx paperback test` (which runs in full Node) passes.
 *
 * Usage: node scripts/restricted-eval.js [bundleFolder]   (default bundles/mangastream)
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const folder = process.argv[2] ?? 'bundles/mangastream'
if (!fs.existsSync(folder)) {
    console.error(`${folder} not found — run "npm run bundle -- --folder=<branch>" first`)
    process.exit(1)
}

// Only globals the iOS runtime actually provides
const makeContext = () => {
    const sandbox = {
        console,
        Math, JSON, Date, RegExp, Error, TypeError, RangeError,
        String, Number, Boolean, Array, Object, Symbol, Map, Set, WeakMap, WeakSet,
        Promise, Proxy, Reflect, Function,
        encodeURI, decodeURI, encodeURIComponent, decodeURIComponent,
        parseInt, parseFloat, isNaN, isFinite,
        setTimeout, clearTimeout, setInterval, clearInterval,
        App: new Proxy({}, { get: () => () => ({}) }),
        exports: {},
        module: { exports: {} }
    }
    sandbox.globalThis = undefined
    return vm.createContext(sandbox)
}

const sources = fs.readdirSync(folder, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)

let failed = 0
for (const source of sources) {
    const bundle = path.join(folder, source, 'source.js')
    if (!fs.existsSync(bundle)) continue

    try {
        new vm.Script(fs.readFileSync(bundle, 'utf8'), { filename: bundle }).runInContext(makeContext(), { timeout: 15000 })
        console.log(`EVAL OK    ${source}`)
    } catch (error) {
        failed++
        console.log(`EVAL FAIL  ${source}: ${error.message}`)
    }
}

console.log(`\n${sources.length - failed}/${sources.length} bundles device-safe`)
process.exit(failed === 0 ? 0 : 1)
