#!/usr/bin/env node
/**
 * Generates the GitHub Pages landing page (index.html) and keeps the
 * README source table in sync with versioning.json.
 *
 * Usage:
 *   node scripts/generate-site.js <bundleFolder> [--readme <path>] [--no-status]
 *
 * - <bundleFolder>  folder containing versioning.json (e.g. bundles/mangastream)
 * - --readme        extra README to patch (e.g. bundles/README.md for gh-pages)
 * - --no-status     skip live backend pings
 *
 * Status rules: any HTTP response = Working (even 403/503 — CF is alive).
 * Only DNS failure / timeout / connection refused = Backend Down.
 * Manual overrides live in repo-status.json: { "Tenshi": "Backend Down" }
 */
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const flags = args.filter(a => a.startsWith('--'))
const positional = args.filter(a => !a.startsWith('--'))
const bundleFolder = positional[0] ?? 'bundles/mangastream'
const extraReadme = flags.includes('--readme') ? args[args.indexOf('--readme') + 1] : null
const skipStatus = flags.includes('--no-status')

const versioningPath = path.join(bundleFolder, 'versioning.json')
if (!fs.existsSync(versioningPath)) {
    console.error(`versioning.json not found at ${versioningPath} — run "npm run bundle -- --folder=<branch>" first`)
    process.exit(1)
}
const { buildTime, sources } = JSON.parse(fs.readFileSync(versioningPath, 'utf8'))

// ── status ────────────────────────────────────────────────────────────────
const overrides = fs.existsSync('repo-status.json')
    ? JSON.parse(fs.readFileSync('repo-status.json', 'utf8'))
    : {}

async function ping(url) {
    try {
        await fetch(url, {
            method: 'HEAD',
            redirect: 'follow',
            signal: AbortSignal.timeout(12000),
            headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Paperback/0.8' }
        })
        return true // any HTTP answer means the backend is alive
    } catch {
        return false // DNS fail / timeout / refused
    }
}

async function resolveStatuses() {
    const status = {}
    await Promise.all(sources.map(async s => {
        if (overrides[s.name]) { status[s.name] = overrides[s.name]; return }
        if (skipStatus || !s.websiteBaseURL) { status[s.name] = 'Working'; return }
        status[s.name] = await ping(s.websiteBaseURL) ? 'Working' : 'Backend Down'
    }))
    return status
}

const RATING = {
    ADULT: { label: '18+', cls: 'adult' },
    MATURE: { label: 'Mature', cls: 'mature' },
    EVERYONE: { label: 'Everyone', cls: 'everyone' }
}

// ── index.html ────────────────────────────────────────────────────────────
function buildHtml(status) {
    const folderName = path.basename(path.resolve(bundleFolder))
    const repoUrl = `https://naufaljct48.github.io/nopools-ext/${folderName}`
    const addUrl = `paperback://addRepo?displayName=${encodeURIComponent(`Nopools ${folderName} (0.8)`)}&url=${encodeURIComponent(repoUrl)}`
    const cards = sources
        .slice().sort((a, b) => a.name.localeCompare(b.name))
        .map(s => {
            const r = RATING[s.contentRating] ?? RATING.EVERYONE
            const st = status[s.name] ?? 'Working'
            const stCls = st === 'Working' ? 'ok' : 'down'
            const icon = `./${s.id}/includes/${s.icon || 'icon.png'}`
            return `    <div class="card">
      <img class="icon" src="${icon}" alt="" loading="lazy" onerror="this.style.display='none'">
      <div class="body">
        <h3>${s.name}</h3>
        <p class="desc">${(s.desc || '').replace(/</g, '&lt;')}</p>
        <div class="meta">
          <span class="chip ver">v${s.version}</span>
          <span class="chip ${r.cls}">${r.label}</span>
          <span class="chip status ${stCls}">${stCls === 'ok' ? '●' : '▲'} ${st}</span>
        </div>
      </div>
      ${s.websiteBaseURL ? `<a class="site" href="${s.websiteBaseURL}" target="_blank" rel="noopener">↗</a>` : ''}
    </div>`
        }).join('\n')

    const working = sources.filter(s => status[s.name] === 'Working').length
    const date = new Date(buildTime || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Nopools ${folderName} (0.8)</title>
<style>
:root{--bg:#0d1117;--panel:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#e97991;--ok:#3fb950;--down:#d29922}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;min-height:100vh}
.wrap{max-width:960px;margin:0 auto;padding:48px 20px 80px}
header{text-align:center;margin-bottom:40px}
header img{width:72px;height:72px;border-radius:16px;margin-bottom:16px}
h1{font-size:2rem;letter-spacing:-.02em}
h1 span{color:var(--accent)}
.tagline{color:var(--muted);margin-top:8px;font-size:.95rem}
.add{display:inline-block;margin-top:20px;padding:12px 28px;background:var(--accent);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;transition:transform .1s}
.add:active{transform:scale(.97)}
.stats{color:var(--muted);font-size:.85rem;margin-top:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.card{display:flex;align-items:center;gap:12px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:14px}
.icon{width:52px;height:52px;border-radius:10px;object-fit:cover;flex-shrink:0;background:#21262d}
.body{flex:1;min-width:0}
h3{font-size:1rem;margin-bottom:4px}
.desc{color:var(--muted);font-size:.78rem;line-height:1.35;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.meta{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-size:.68rem;padding:3px 8px;border-radius:20px;border:1px solid var(--border);color:var(--muted);white-space:nowrap}
.chip.ver{color:var(--text)}
.chip.adult{color:#f85149;border-color:#f8514955}
.chip.mature{color:#d29922;border-color:#d2992255}
.chip.everyone{color:#3fb950;border-color:#3fb95055}
.chip.ok{color:var(--ok);border-color:#3fb95055}
.chip.down{color:var(--down);border-color:#d2992255}
.site{color:var(--muted);text-decoration:none;font-size:1.1rem;padding:6px}
footer{margin-top:48px;text-align:center;color:var(--muted);font-size:.8rem}
footer a{color:var(--accent);text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
<header>
  <img src="https://paperback.moe/icons/logo-alt.svg" alt="logo">
  <h1>Nopools <span>${folderName}</span> <small>(0.8)</small></h1>
  <p class="tagline">Indonesian Paperback extensions by <a href="https://github.com/naufaljct48" style="color:var(--accent)">NaufalJCT48</a></p>
  <a class="add" href="${addUrl}">Add to Paperback</a>
  <p class="stats">${working}/${sources.length} sources working · updated ${date}</p>
</header>
<div class="grid">
${cards}
</div>
<footer>
  <p>Base URL: <code>${repoUrl}</code></p>
  <p style="margin-top:6px">Report issues on <a href="https://github.com/naufaljct48/nopools-ext/issues">GitHub</a> · GPL-3.0</p>
</footer>
</div>
</body>
</html>
`
}

// ── README table sync ─────────────────────────────────────────────────────
const BEGIN_TAG = '<!-- SOURCES:BEGIN — auto-synced from versioning.json by scripts/generate-site.js; do not edit between markers -->'
const BEGIN = '<!-- SOURCES:BEGIN'
const END = '<!-- SOURCES:END -->'

function buildTable(status) {
    const rows = sources
        .slice().sort((a, b) => a.name.localeCompare(b.name))
        .map(s => {
            const r = RATING[s.contentRating] ?? RATING.EVERYONE
            const adult = s.contentRating === 'ADULT' ? '**Yes**' : (s.contentRating === 'MATURE' ? 'Mature' : 'No')
            const st = status[s.name] ?? 'Working'
            const icon = st === 'Working' ? '✅' : '⚠️'
            return `| ${s.name} 🇮🇩 | ${icon} ${st} | ${adult} |`
        }).join('\n')
    const working = sources.filter(s => status[s.name] === 'Working').length
    const broken = sources.filter(s => status[s.name] !== 'Working').map(s => `${s.name} (${status[s.name]})`).join(', ')
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const statusLine = working === sources.length
        ? `- **Status:** All ${sources.length} sources working.`
        : `- **Status:** ${working}/${sources.length} working — ${broken}.`
    return `${BEGIN_TAG}
| Source | Status | Adult (18+) |
|--------|:------:|:-----------:|
${rows}

## 📅 Last Update
- **Date:** ${date}
${statusLine}
${END}`
}

function patchReadme(file, status) {
    if (!fs.existsSync(file)) return false
    let h = fs.readFileSync(file, 'utf8')
    if (!h.includes(BEGIN) || !h.includes(END)) return false
    const before = h.slice(0, h.indexOf(BEGIN))
    const after = h.slice(h.indexOf(END) + END.length)
    fs.writeFileSync(file, before + buildTable(status) + after)
    return true
}

// ── main ──────────────────────────────────────────────────────────────────
;(async () => {
    const status = await resolveStatuses()

    const indexPath = path.join(bundleFolder, 'index.html')
    fs.writeFileSync(indexPath, buildHtml(status))
    console.log(`wrote ${indexPath}`)

    for (const f of ['./README.md', extraReadme].filter(Boolean)) {
        console.log(patchReadme(f, status) ? `synced ${f}` : `skipped ${f} (no ${BEGIN} markers)`)
    }
    console.log('status:', JSON.stringify(status))
})()
