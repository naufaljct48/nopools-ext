#!/usr/bin/env node
/**
 * Generates the GitHub Pages landing pages and keeps the README source table
 * in sync with versioning.json.
 *
 * Usage:
 *   node scripts/generate-site.js <bundleFolder> [--readme <path>] [--root <dir>] [--no-status]
 *
 * - <bundleFolder>  folder containing versioning.json (e.g. bundles/mangastream)
 * - --readme        extra README to patch (e.g. bundles/README.md for gh-pages)
 * - --root          also write a repo-root index.html there (e.g. bundles), listing
 *                   every branch folder that has a versioning.json
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
const valueOf = (flag) => flags.includes(flag) ? args[args.indexOf(flag) + 1] : null
const extraReadme = valueOf('--readme')
const rootDir = valueOf('--root')
const skipStatus = flags.includes('--no-status')

const versioningPath = path.join(bundleFolder, 'versioning.json')
if (!fs.existsSync(versioningPath)) {
    console.error(`versioning.json not found at ${versioningPath} — run "npm run bundle -- --folder=<branch>" first`)
    process.exit(1)
}
const { buildTime, sources } = JSON.parse(fs.readFileSync(versioningPath, 'utf8'))

const GITHUB_USER = 'naufaljct48'
const PAGES_ROOT = `https://${GITHUB_USER}.github.io/nopools-ext`
const REPO_URL = `https://github.com/${GITHUB_USER}/nopools-ext`

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
    ADULT: { label: '18+', cls: 'adult', flag: 'adult' },
    MATURE: { label: 'Mature', cls: 'mature', flag: 'mature' },
    EVERYONE: { label: 'Everyone', cls: 'everyone', flag: 'everyone' }
}

const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const formatDate = (value) => new Date(value || Date.now())
    .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

const titleCase = (value) => String(value).charAt(0).toUpperCase() + String(value).slice(1)

// A branch that has been superseded carries repo-notice.json at the repo root:
// { "movedTo": "omakase", "message": "..." }. The banner it produces is the only
// warning a user of the old repo URL will ever see, so it is rendered on the branch
// page and mirrored into meta.json for the root index.
const notice = fs.existsSync('repo-notice.json')
    ? JSON.parse(fs.readFileSync('repo-notice.json', 'utf8'))
    : null

// ── shared page chrome ────────────────────────────────────────────────────
const STYLE = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0c11;--bg-soft:#0f131b;--panel:#131823;--panel-2:#171d2b;--border:#232c3d;
  --text:#e8edf6;--muted:#8b97ad;--accent:#e97991;--accent-2:#7aa2f7;
  --ok:#4ade80;--down:#fbbf24;--danger:#f87171;--shadow:0 10px 30px rgba(0,0,0,.35);
  --radius:16px;
}
@media (prefers-color-scheme: light){
  :root{
    --bg:#f6f7fb;--bg-soft:#eef1f8;--panel:#ffffff;--panel-2:#f7f9fd;--border:#e2e7f0;
    --text:#141a25;--muted:#5c6880;--shadow:0 10px 30px rgba(20,26,37,.08);
  }
}
html{scroll-behavior:smooth}
body{
  background:
    radial-gradient(1100px 520px at 12% -8%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 60%),
    radial-gradient(900px 480px at 92% 0%, color-mix(in srgb, var(--accent-2) 16%, transparent), transparent 55%),
    var(--bg);
  color:var(--text);min-height:100vh;line-height:1.5;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
a{color:inherit}
.wrap{max-width:1080px;margin:0 auto;padding:56px 20px 96px}
.hero{text-align:center;margin-bottom:40px}
.logo{width:78px;height:78px;border-radius:22px;margin:0 auto 18px;display:block;object-fit:cover;
  box-shadow:var(--shadow);background:var(--panel)}
h1{font-size:clamp(1.9rem,4.6vw,2.7rem);letter-spacing:-.03em;font-weight:800;line-height:1.1}
h1 .grad{background:linear-gradient(92deg,var(--accent),var(--accent-2));-webkit-background-clip:text;background-clip:text;color:transparent}
.tagline{color:var(--muted);margin-top:12px;font-size:1rem}
.tagline a{color:var(--accent);text-decoration:none;font-weight:600}
.cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:26px}
.btn{display:inline-flex;align-items:center;gap:9px;padding:13px 26px;border-radius:999px;
  text-decoration:none;font-weight:650;font-size:.95rem;border:1px solid transparent;transition:transform .12s ease,box-shadow .12s ease,background .12s}
.btn.primary{background:linear-gradient(92deg,var(--accent),color-mix(in srgb,var(--accent) 55%, var(--accent-2)));color:#fff;box-shadow:var(--shadow)}
.btn.ghost{background:var(--panel);border-color:var(--border);color:var(--text)}
.btn:hover{transform:translateY(-2px)}
.btn:active{transform:translateY(0) scale(.985)}
.stats{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:22px}
.stat{background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:7px 15px;font-size:.82rem;color:var(--muted)}
.stat b{color:var(--text);font-weight:650}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px;vertical-align:middle}
.dot.ok{background:var(--ok);box-shadow:0 0 0 4px color-mix(in srgb,var(--ok) 22%, transparent)}
.dot.down{background:var(--down);box-shadow:0 0 0 4px color-mix(in srgb,var(--down) 22%, transparent)}
.toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;
  margin:36px 0 18px;position:sticky;top:0;z-index:5;padding:14px 0;
  background:linear-gradient(var(--bg) 72%, transparent)}
.search{flex:1 1 260px;position:relative}
.search input{width:100%;padding:12px 16px 12px 42px;border-radius:12px;font-size:.94rem;font-family:inherit;
  background:var(--panel);border:1px solid var(--border);color:var(--text);outline:none;transition:border-color .15s,box-shadow .15s}
.search input:focus{border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 18%, transparent)}
.search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);opacity:.55}
.filters{display:flex;gap:8px;flex-wrap:wrap}
.chip-btn{padding:9px 15px;border-radius:999px;border:1px solid var(--border);background:var(--panel);
  color:var(--muted);font-size:.83rem;font-family:inherit;cursor:pointer;font-weight:600;transition:.15s}
.chip-btn:hover{color:var(--text);border-color:color-mix(in srgb,var(--accent) 45%, var(--border))}
.chip-btn[aria-pressed="true"]{background:color-mix(in srgb,var(--accent) 16%, var(--panel));color:var(--text);border-color:var(--accent)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.card{display:flex;align-items:center;gap:14px;background:var(--panel);border:1px solid var(--border);
  border-radius:var(--radius);padding:16px;transition:transform .14s ease,border-color .14s,box-shadow .14s;position:relative}
.card:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--accent) 40%, var(--border));box-shadow:var(--shadow)}
.card.is-down{opacity:.72}
.icon{width:56px;height:56px;border-radius:14px;object-fit:cover;flex-shrink:0;background:var(--panel-2);border:1px solid var(--border)}
.body{flex:1;min-width:0}
.name{font-size:1rem;font-weight:700;letter-spacing:-.01em;margin-bottom:3px;display:flex;align-items:center;gap:7px}
.desc{color:var(--muted);font-size:.78rem;line-height:1.4;margin-bottom:9px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.meta{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-size:.68rem;padding:3px 9px;border-radius:999px;border:1px solid var(--border);color:var(--muted);white-space:nowrap;font-weight:600}
.chip.ver{color:var(--text);background:var(--panel-2)}
.chip.adult{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 45%, transparent)}
.chip.mature{color:var(--down);border-color:color-mix(in srgb,var(--down) 45%, transparent)}
.chip.everyone{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%, transparent)}
.chip.status.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%, transparent)}
.chip.status.down{color:var(--down);border-color:color-mix(in srgb,var(--down) 45%, transparent)}
.site{color:var(--muted);text-decoration:none;font-size:1rem;padding:8px;border-radius:10px;transition:.15s;align-self:flex-start}
.site:hover{color:var(--accent);background:var(--panel-2)}
.empty{display:none;text-align:center;color:var(--muted);padding:48px 0;font-size:.92rem}
.notice{margin:8px 0 4px;padding:20px 22px;border-radius:var(--radius);text-align:center;
  border:1px solid color-mix(in srgb,var(--down) 45%, var(--border));
  background:color-mix(in srgb,var(--down) 10%, var(--panel))}
.notice strong{font-size:1.02rem;letter-spacing:-.01em}
.notice p{color:var(--muted);font-size:.87rem;margin:8px auto 14px;max-width:56ch}
.notice p.small{font-size:.78rem;margin:12px 0 0}
.repo.moved{opacity:.68}
.chip.moved{color:var(--down);border-color:color-mix(in srgb,var(--down) 45%, transparent)}
.section-title{font-size:.78rem;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);font-weight:700;margin:8px 0 14px}
.repo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.repo{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:22px;transition:.15s;text-decoration:none;display:block}
.repo:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--accent) 40%, var(--border));box-shadow:var(--shadow)}
.repo h3{font-size:1.15rem;font-weight:750;letter-spacing:-.02em;display:flex;align-items:center;gap:9px}
.repo p{color:var(--muted);font-size:.85rem;margin:9px 0 16px}
.repo .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.thumbs{display:flex;margin:16px 0 0}
.thumbs img{width:34px;height:34px;border-radius:10px;border:2px solid var(--panel);margin-left:-9px;background:var(--panel-2)}
.thumbs img:first-child{margin-left:0}
.thumbs .more{width:34px;height:34px;border-radius:10px;border:2px solid var(--panel);margin-left:-9px;background:var(--panel-2);
  display:grid;place-items:center;font-size:.66rem;color:var(--muted);font-weight:700}
code{background:var(--panel);border:1px solid var(--border);border-radius:7px;padding:3px 8px;font-size:.8rem}
footer{margin-top:56px;text-align:center;color:var(--muted);font-size:.82rem;line-height:1.9}
footer a{color:var(--accent);text-decoration:none}
@media (max-width:520px){.wrap{padding:36px 16px 72px}.toolbar{position:static}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`

const head = (title, description) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="dark light">
<title>${esc(title)}</title>
<link rel="icon" href="./paperback-logo.svg" type="image/svg+xml">
<style>${STYLE}</style>
</head>
<body>`

// ── per-branch page (source catalog) ──────────────────────────────────────
function buildBranchHtml(status) {
    const folderName = path.basename(path.resolve(bundleFolder))
    const repoUrl = `${PAGES_ROOT}/${folderName}`
    const addUrl = `paperback://addRepo?displayName=${encodeURIComponent(`Nopools ${titleCase(folderName)} (0.8)`)}&url=${encodeURIComponent(repoUrl)}`

    const banner = notice?.movedTo
        ? `    <div class="notice">
      <strong>This repository has moved.</strong>
      <p>${esc(notice.message || `It is now published as “${titleCase(notice.movedTo)}”. This copy still works but no longer receives new sources — please add the new one in Paperback.`)}</p>
      <a class="btn primary" href="paperback://addRepo?displayName=${encodeURIComponent(`Nopools ${titleCase(notice.movedTo)} (0.8)`)}&amp;url=${encodeURIComponent(`${PAGES_ROOT}/${notice.movedTo}`)}">＋ Add the new repository</a>
      <p class="small">New base URL: <code>${PAGES_ROOT}/${esc(notice.movedTo)}</code></p>
    </div>
`
        : ''

    const cards = sources
        .slice().sort((a, b) => a.name.localeCompare(b.name))
        .map(s => {
            const r = RATING[s.contentRating] ?? RATING.EVERYONE
            const st = status[s.name] ?? 'Working'
            const ok = st === 'Working'
            const icon = `./${s.id}/includes/${s.icon || 'icon.png'}`
            return `      <article class="card${ok ? '' : ' is-down'}" data-name="${esc(s.name.toLowerCase())}" data-rating="${r.flag}" data-status="${ok ? 'ok' : 'down'}">
        <img class="icon" src="${esc(icon)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="body">
          <h3 class="name">${esc(s.name)} <span aria-hidden="true">🇮🇩</span></h3>
          <p class="desc">${esc(s.desc || '')}</p>
          <div class="meta">
            <span class="chip ver">v${esc(s.version)}</span>
            <span class="chip ${r.cls}">${r.label}</span>
            <span class="chip status ${ok ? 'ok' : 'down'}">${ok ? '●' : '▲'} ${st}</span>
          </div>
        </div>
        ${s.websiteBaseURL ? `<a class="site" href="${esc(s.websiteBaseURL)}" target="_blank" rel="noopener" title="Open ${esc(s.name)}" aria-label="Open ${esc(s.name)}">↗</a>` : ''}
      </article>`
        }).join('\n')

    const working = sources.filter(s => status[s.name] === 'Working').length
    const adult = sources.filter(s => s.contentRating === 'ADULT').length

    return `${head(`Nopools ${titleCase(folderName)} (0.8)`, `${sources.length} curated Paperback 0.8 sources`)}
<div class="wrap">
  <header class="hero">
    <img class="logo" src="./paperback-logo.svg" alt="Paperback" width="78" height="78">

    <h1>Nopools <span class="grad">${esc(titleCase(folderName))}</span></h1>
    <p class="tagline">Indonesian Paperback 0.8 extensions by <a href="https://github.com/${GITHUB_USER}">NaufalJCT48</a></p>
    <div class="cta">
      <a class="btn primary" href="${addUrl}">＋ Add to Paperback</a>
      <a class="btn ghost" href="${PAGES_ROOT}/">All repositories</a>
    </div>
    <div class="stats">
      <span class="stat"><b>${sources.length}</b> sources</span>
      <span class="stat"><span class="dot ok"></span><b>${working}</b> working</span>
      ${working < sources.length ? `<span class="stat"><span class="dot down"></span><b>${sources.length - working}</b> down</span>` : ''}
      <span class="stat"><b>${adult}</b> adult</span>
      <span class="stat">updated <b>${formatDate(buildTime)}</b></span>
    </div>
  </header>

${banner}
  <div class="toolbar">
    <div class="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="q" type="search" placeholder="Search sources…" autocomplete="off" aria-label="Search sources">
    </div>
    <div class="filters" role="group" aria-label="Filter sources">
      <button class="chip-btn" data-filter="all" aria-pressed="true">All</button>
      <button class="chip-btn" data-filter="ok" aria-pressed="false">Working</button>
      <button class="chip-btn" data-filter="down" aria-pressed="false">Down</button>
      <button class="chip-btn" data-filter="everyone" aria-pressed="false">Everyone</button>
      <button class="chip-btn" data-filter="adult" aria-pressed="false">18+</button>
    </div>
  </div>

  <main>
    <div class="grid" id="grid">
${cards}
    </div>
    <p class="empty" id="empty">No source matches that filter.</p>
  </main>

  <footer>
    <p>Base URL: <code>${repoUrl}</code></p>
    <p>Open the button above on your device, or paste the base URL into Paperback → Settings → Extensions.</p>
    <p><a href="${REPO_URL}">GitHub</a> · <a href="${REPO_URL}/issues">Report an issue</a> · GPL-3.0</p>
  </footer>
</div>
<script>
(function(){
  var cards=[].slice.call(document.querySelectorAll('.card'));
  var q=document.getElementById('q'),empty=document.getElementById('empty');
  var buttons=[].slice.call(document.querySelectorAll('.chip-btn'));
  var filter='all';
  function apply(){
    var term=(q.value||'').trim().toLowerCase(),shown=0;
    cards.forEach(function(card){
      var matchTerm=!term||card.dataset.name.indexOf(term)>-1;
      var matchFilter=filter==='all'
        ||(filter==='ok'||filter==='down'?card.dataset.status===filter:card.dataset.rating===filter);
      var show=matchTerm&&matchFilter;
      card.style.display=show?'':'none';
      if(show)shown++;
    });
    empty.style.display=shown?'none':'block';
  }
  q.addEventListener('input',apply);
  buttons.forEach(function(button){
    button.addEventListener('click',function(){
      filter=button.dataset.filter;
      buttons.forEach(function(b){b.setAttribute('aria-pressed',String(b===button))});
      apply();
    });
  });
})();
</script>
</body>
</html>
`
}

// ── repo root page (index of branch folders) ──────────────────────────────
function buildRootHtml(rootPath, currentStatus) {
    const folders = fs.readdirSync(rootPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && fs.existsSync(path.join(rootPath, entry.name, 'versioning.json')))
        .map(entry => entry.name)
        .sort()

    const currentFolder = path.basename(path.resolve(bundleFolder))

    const cards = folders.map(folder => {
        const data = JSON.parse(fs.readFileSync(path.join(rootPath, folder, 'versioning.json'), 'utf8'))
        const list = data.sources ?? []
        const status = folder === currentFolder ? currentStatus : {}
        const working = list.filter(s => (status[s.name] ?? 'Working') === 'Working').length
        const repoUrl = `${PAGES_ROOT}/${folder}`
        const addUrl = `paperback://addRepo?displayName=${encodeURIComponent(`Nopools ${titleCase(folder)} (0.8)`)}&url=${encodeURIComponent(repoUrl)}`

        // meta.json is written next to each bundle so this page knows which folders
        // have been superseded, even though it only ever builds one of them
        const metaPath = path.join(rootPath, folder, 'meta.json')
        const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {}
        const movedTo = folder === currentFolder ? notice?.movedTo : meta?.movedTo
        const thumbs = list.slice(0, 6)
            .map(s => `<img src="./${esc(folder)}/${esc(s.id)}/includes/${esc(s.icon || 'icon.png')}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`)
            .join('')
        const rest = list.length - Math.min(list.length, 6)

        return `      <div class="repo${movedTo ? ' moved' : ''}">
        <h3>${esc(titleCase(folder))} <span class="chip ver">0.8</span>${movedTo ? ` <span class="chip moved">moved → ${esc(titleCase(movedTo))}</span>` : ''}</h3>
        <p>${list.length} source${list.length === 1 ? '' : 's'} · <span class="dot ok"></span>${working} working${working < list.length ? ` · <span class="dot down"></span>${list.length - working} down` : ''} · updated ${formatDate(data.buildTime)}</p>
        <div class="row">
          <a class="btn ${movedTo ? 'ghost' : 'primary'}" href="${addUrl}">＋ Add to Paperback</a>
          <a class="btn ghost" href="${repoUrl}/">Browse sources</a>
        </div>
        <div class="thumbs">${thumbs}${rest > 0 ? `<span class="more">+${rest}</span>` : ''}</div>
      </div>`
    }).join('\n')

    const total = folders.reduce((sum, folder) => {
        const data = JSON.parse(fs.readFileSync(path.join(rootPath, folder, 'versioning.json'), 'utf8'))
        return sum + (data.sources?.length ?? 0)
    }, 0)

    return `${head('Nopools Extensions (0.8)', 'Indonesian Paperback 0.8 extension repositories')}
<div class="wrap">
  <header class="hero">
    <img class="logo" src="./paperback-logo.svg" alt="Paperback" width="78" height="78">

    <h1>Nopools <span class="grad">Extensions</span></h1>
    <p class="tagline">Indonesian Paperback 0.8 extensions by <a href="https://github.com/${GITHUB_USER}">NaufalJCT48</a></p>
    <div class="stats">
      <span class="stat"><b>${folders.length}</b> repositor${folders.length === 1 ? 'y' : 'ies'}</span>
      <span class="stat"><b>${total}</b> sources</span>
      <span class="stat">updated <b>${formatDate(buildTime)}</b></span>
    </div>
  </header>

  <main>
    <p class="section-title">Repositories</p>
    <div class="repo-grid">
${cards}
    </div>
  </main>

  <footer>
    <p>Tap <b>Add to Paperback</b> on the device that runs the app, or paste the repository URL into Paperback → Settings → Extensions.</p>
    <p><a href="${REPO_URL}">GitHub</a> · <a href="${REPO_URL}/issues">Report an issue</a> · GPL-3.0</p>
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
            const adult = s.contentRating === 'ADULT' ? '**Yes**' : (s.contentRating === 'MATURE' ? 'Mature' : 'No')
            const st = status[s.name] ?? 'Working'
            const icon = st === 'Working' ? '✅' : '⚠️'
            return `| ${s.name} 🇮🇩 | ${icon} ${st} | ${adult} |`
        }).join('\n')
    const working = sources.filter(s => status[s.name] === 'Working').length
    const broken = sources.filter(s => status[s.name] !== 'Working').map(s => `${s.name} (${status[s.name]})`).join(', ')
    const statusLine = working === sources.length
        ? `- **Status:** All ${sources.length} sources working.`
        : `- **Status:** ${working}/${sources.length} working — ${broken}.`
    return `${BEGIN_TAG}
| Source | Status | Adult (18+) |
|--------|:------:|:-----------:|
${rows}

## 📅 Last Update
- **Date:** ${formatDate(Date.now())}
${statusLine}
${END}`
}

function patchReadme(file, status) {
    if (!fs.existsSync(file)) return false
    const h = fs.readFileSync(file, 'utf8')
    if (!h.includes(BEGIN) || !h.includes(END)) return false
    const before = h.slice(0, h.indexOf(BEGIN))
    const after = h.slice(h.indexOf(END) + END.length)
    fs.writeFileSync(file, before + buildTable(status) + after)
    return true
}

// The Paperback logo ships with the repo and is copied next to each page, so the
// pages stay same-origin (no request to paperback.moe) while still showing it.
const LOGO_SOURCE = path.join(__dirname, 'assets', 'paperback-logo.svg')

function copyLogo(targetDir) {
    if (!fs.existsSync(LOGO_SOURCE)) {
        console.log(`!! ${LOGO_SOURCE} missing — pages will show a broken logo`)
        return
    }
    fs.copyFileSync(LOGO_SOURCE, path.join(targetDir, 'paperback-logo.svg'))
}

// ── main ──────────────────────────────────────────────────────────────────
;(async () => {
    const status = await resolveStatuses()

    const indexPath = path.join(bundleFolder, 'index.html')
    fs.writeFileSync(indexPath, buildBranchHtml(status))
    copyLogo(bundleFolder)
    fs.writeFileSync(path.join(bundleFolder, 'meta.json'), JSON.stringify({
        folder: path.basename(path.resolve(bundleFolder)),
        buildTime: buildTime ?? null,
        sourceCount: sources.length,
        movedTo: notice?.movedTo ?? null
    }, null, 2))
    console.log(`wrote ${indexPath}${notice?.movedTo ? ` (moved-to notice → ${notice.movedTo})` : ''}`)

    if (rootDir) {
        if (fs.existsSync(rootDir)) {
            const rootIndex = path.join(rootDir, 'index.html')
            fs.writeFileSync(rootIndex, buildRootHtml(rootDir, status))
            copyLogo(rootDir)
            console.log(`wrote ${rootIndex}`)
        } else {
            console.log(`skipped root index (${rootDir} not found)`)
        }
    }

    for (const f of ['./README.md', extraReadme].filter(Boolean)) {
        console.log(patchReadme(f, status) ? `synced ${f}` : `skipped ${f} (no ${BEGIN} markers)`)
    }
    console.log('status:', JSON.stringify(status))
})()
