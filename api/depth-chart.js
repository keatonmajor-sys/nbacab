import * as cheerio from 'cheerio'

const REALGM_URL = 'https://basketball.realgm.com/nba/depth-charts'
const ESPN_DEPTH_URL = 'https://www.espn.com/nba/depth'
const ROTOWIRE_URL = 'https://www.rotowire.com/basketball/nba-depth-charts.php'

const TEAM_NAMES = {
  ATL: 'Atlanta Hawks', BOS: 'Boston Celtics', BKN: 'Brooklyn Nets', CHA: 'Charlotte Hornets',
  CHI: 'Chicago Bulls', CLE: 'Cleveland Cavaliers', DAL: 'Dallas Mavericks', DEN: 'Denver Nuggets',
  DET: 'Detroit Pistons', GSW: 'Golden State Warriors', HOU: 'Houston Rockets', IND: 'Indiana Pacers',
  LAC: 'Los Angeles Clippers', LAL: 'Los Angeles Lakers', MEM: 'Memphis Grizzlies', MIA: 'Miami Heat',
  MIL: 'Milwaukee Bucks', MIN: 'Minnesota Timberwolves', NOP: 'New Orleans Pelicans', NYK: 'New York Knicks',
  OKC: 'Oklahoma City Thunder', ORL: 'Orlando Magic', PHI: 'Philadelphia 76ers', PHX: 'Phoenix Suns',
  POR: 'Portland Trail Blazers', SAC: 'Sacramento Kings', SAS: 'San Antonio Spurs', TOR: 'Toronto Raptors',
  UTA: 'Utah Jazz', WAS: 'Washington Wizards',
}
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']
const ESPN_TEAM_LABELS = {
  ATL:'Atlanta', BOS:'Boston', BKN:'Brooklyn', CHA:'Charlotte', CHI:'Chicago', CLE:'Cleveland', DAL:'Dallas', DEN:'Denver', DET:'Detroit', GSW:'Golden State', HOU:'Houston', IND:'Indiana', LAC:'LA Clippers', LAL:'LA Lakers', MEM:'Memphis', MIA:'Miami', MIL:'Milwaukee', MIN:'Minnesota', NOP:'New Orleans', NYK:'New York', OKC:'Oklahoma City', ORL:'Orlando', PHI:'Philadelphia', PHX:'Phoenix', POR:'Portland', SAC:'Sacramento', SAS:'San Antonio', TOR:'Toronto', UTA:'Utah', WAS:'Washington'
}

function clean(value = '') { return String(value).replace(/\s+/g, ' ').trim() }
function norm(value = '') {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}
function seasonStart(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return month >= 6 ? year : year - 1
}
async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; NBACAB/1.0; +https://nbacab.vercel.app)',
    },
  })
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`)
  return response.text()
}
function blankChart() { return Object.fromEntries(POSITIONS.map((p) => [p, []])) }
function playerText(cell, $) {
  const links = $(cell).find('a')
  if (links.length) {
    // RealGM player links are the cleanest source and avoid the stats text under the name.
    const candidate = clean(links.first().text())
    if (candidate) return candidate
  }
  const text = clean($(cell).clone().children().remove().end().text()) || clean($(cell).text())
  return text.replace(/\b\d+(?:\.\d+)?\s*[prab]\b.*$/i, '').trim()
}
function findRealGmTeamTable($, teamName) {
  const target = norm(teamName)
  let heading = null
  $('h1,h2,h3,h4').each((_, el) => {
    if (heading) return
    const t = norm($(el).text().replace(/\d{4}-\d{4}/g, '').replace(/depth chart/ig, ''))
    if (t && (t.includes(target) || target.includes(t))) heading = $(el)
  })
  if (heading?.length) {
    let node = heading.next()
    for (let i = 0; node?.length && i < 8; i += 1, node = node.next()) {
      if (String(node[0]?.tagName).toLowerCase() === 'table') return node
      const nested = node.find?.('table').first()
      if (nested?.length) return nested
    }
  }
  // Fallback: locate a table with PG/SG/SF/PF/C whose nearby text names this team.
  let found = null
  $('table').each((_, table) => {
    if (found) return
    const headers = $(table).find('tr').first().find('th,td').map((__, c) => clean($(c).text()).toUpperCase()).get()
    if (!POSITIONS.every((p) => headers.includes(p))) return
    const nearby = clean($(table).prevAll('h1,h2,h3,h4').first().text())
    if (norm(nearby).includes(target)) found = $(table)
  })
  return found
}
function parseRealGM(html, teamName) {
  const $ = cheerio.load(html)
  const table = findRealGmTeamTable($, teamName)
  if (!table?.length) return null
  const chart = blankChart()
  let starters = null
  table.find('tr').each((rowIndex, row) => {
    const cells = $(row).find('th,td').toArray()
    if (cells.length < 6) return
    const role = clean($(cells[0]).text())
    if (!/^(starters?|rotation|lim(?:ited)?\s*pt)/i.test(role)) return
    const rowPlayers = {}
    POSITIONS.forEach((pos, i) => {
      const name = playerText(cells[i + 1], $)
      if (!name || /^(?:-|—|n\/a)$/i.test(name)) return
      chart[pos].push(name)
      rowPlayers[pos] = name
    })
    if (/^starters?/i.test(role)) starters = rowPlayers
  })
  if (!POSITIONS.some((p) => chart[p].length)) return null
  return { chart, starters: starters || Object.fromEntries(POSITIONS.map((p) => [p, chart[p][0] || null])) }
}

function parseESPN(html, teamAbbr) {
  const $ = cheerio.load(html)
  const wanted = norm(ESPN_TEAM_LABELS[teamAbbr] || TEAM_NAMES[teamAbbr])
  let result = null
  $('table').each((_, table) => {
    if (result) return
    const rows = $(table).find('tr').toArray()
    if (!rows.length) return
    const headers = $(rows[0]).find('th,td').map((__, c) => clean($(c).text()).toUpperCase()).get()
    const indices = Object.fromEntries(POSITIONS.map((p) => [p, headers.indexOf(p)]))
    if (POSITIONS.filter((p) => indices[p] >= 0).length < 5) return
    for (const row of rows.slice(1)) {
      const cells = $(row).find('th,td').toArray()
      if (!cells.length) continue
      const teamCell = clean($(cells[0]).text())
      if (!teamCell || !(norm(teamCell).includes(wanted) || wanted.includes(norm(teamCell)))) continue
      const starters = {}
      for (const p of POSITIONS) {
        const idx = indices[p]
        if (idx < 0 || !cells[idx]) continue
        const name = playerText(cells[idx], $).replace(/\s*\(IL\)\s*$/i, '').trim()
        if (name) starters[p] = name
      }
      if (Object.keys(starters).length >= 4) {
        const chart = blankChart()
        POSITIONS.forEach((p) => { if (starters[p]) chart[p].push(starters[p]) })
        result = { chart, starters }
        break
      }
    }
  })
  return result
}

// RotoWire's markup changes periodically, so this parser is deliberately defensive.
// When it cannot confidently identify five position columns, it returns null and RealGM remains authoritative.
function parseRotoWire(html, teamName, teamAbbr) {
  const $ = cheerio.load(html)
  const aliases = [teamName, teamAbbr]
  let root = null
  $('[data-team], .depth-chart, .depthchart, .nba-depth-chart, article, section').each((_, el) => {
    if (root) return
    const text = clean($(el).text()).slice(0, 260)
    if (aliases.some((a) => norm(text).includes(norm(a))) && POSITIONS.filter((p) => text.toUpperCase().includes(p)).length >= 3) root = $(el)
  })
  if (!root?.length) return null

  const chart = blankChart()
  const tables = root.is('table') ? root : root.find('table')
  let table = null
  tables.each((_, t) => {
    if (table) return
    const headers = $(t).find('tr').first().find('th,td').map((__, c) => clean($(c).text()).toUpperCase()).get()
    if (POSITIONS.filter((p) => headers.includes(p)).length >= 4) table = $(t)
  })
  if (table?.length) {
    const headerCells = table.find('tr').first().find('th,td').map((_, c) => clean($(c).text()).toUpperCase()).get()
    const posIndex = Object.fromEntries(POSITIONS.map((p) => [p, headerCells.indexOf(p)]))
    table.find('tr').slice(1).each((_, row) => {
      const cells = $(row).find('th,td').toArray()
      POSITIONS.forEach((p) => {
        const idx = posIndex[p]
        if (idx < 0 || !cells[idx]) return
        const name = playerText(cells[idx], $)
        if (name && !chart[p].some((x) => norm(x) === norm(name))) chart[p].push(name)
      })
    })
  }
  if (!POSITIONS.some((p) => chart[p].length)) return null
  return { chart, starters: Object.fromEntries(POSITIONS.map((p) => [p, chart[p][0] || null])) }
}
function namesLikelyMatch(a, b) {
  const na = norm(a), nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const aParts = clean(a).toLowerCase().replace(/[^a-z.\- '\u00c0-\u024f]/g, '').split(/\s+/).filter(Boolean)
  const bParts = clean(b).toLowerCase().replace(/[^a-z.\- '\u00c0-\u024f]/g, '').split(/\s+/).filter(Boolean)
  const aLast = norm(aParts.at(-1) || ''), bLast = norm(bParts.at(-1) || '')
  if (!aLast || aLast !== bLast) return false
  const ai = norm(aParts[0] || '')[0], bi = norm(bParts[0] || '')[0]
  return !ai || !bi || ai === bi
}
function buildValidation(primary, secondary, secondaryName = 'secondary source') {
  if (!primary) return { confidence: 'unavailable', agreements: 0, conflicts: [], checked: 0 }
  if (!secondary) return { confidence: 'medium', agreements: 0, conflicts: [], checked: 0, note: 'Primary projection available; secondary validation unavailable.' }
  let agreements = 0
  const conflicts = []
  for (const p of POSITIONS) {
    const a = primary.starters?.[p]
    const b = secondary.starters?.[p]
    if (!a || !b) continue
    if (namesLikelyMatch(a, b)) agreements += 1
    else conflicts.push({ position: p, realgm: a, rotowire: b })
  }
  const checked = agreements + conflicts.length
  const confidence = checked >= 4 && agreements >= 4 ? 'high' : checked >= 3 && agreements >= 2 ? 'medium' : 'low'
  return { confidence, agreements, conflicts, checked, secondary: secondaryName }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const teamAbbr = String(req.query.teamAbbr || '').toUpperCase().trim()
  const teamName = TEAM_NAMES[teamAbbr]
  if (!teamName) return res.status(400).json({ error: 'A valid NBA teamAbbr is required.' })

  const [realgmResult, espnResult, rotowireResult] = await Promise.allSettled([fetchHtml(REALGM_URL), fetchHtml(ESPN_DEPTH_URL), fetchHtml(ROTOWIRE_URL)])
  const realgm = realgmResult.status === 'fulfilled' ? parseRealGM(realgmResult.value, teamName) : null
  const espn = espnResult.status === 'fulfilled' ? parseESPN(espnResult.value, teamAbbr) : null
  const rotowire = rotowireResult.status === 'fulfilled' ? parseRotoWire(rotowireResult.value, teamName, teamAbbr) : null

  if (!realgm && !espn && !rotowire) {
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800')
    return res.status(502).json({
      error: 'Projected depth-chart sources are temporarily unavailable.',
      sources: {
        realgm: { ok: false, error: realgmResult.status === 'rejected' ? realgmResult.reason?.message : 'Unable to parse team depth chart.' },
        espn: { ok: false, error: espnResult.status === 'rejected' ? espnResult.reason?.message : 'Unable to parse team depth chart.' },
        rotowire: { ok: false, error: rotowireResult.status === 'rejected' ? rotowireResult.reason?.message : 'Unable to parse team depth chart.' },
      },
    })
  }

  const primary = realgm || espn || rotowire
  const primaryName = realgm ? 'RealGM' : espn ? 'ESPN' : 'RotoWire'
  const secondary = realgm ? (espn || rotowire) : (espn && rotowire ? rotowire : null)
  const secondaryName = realgm && espn ? 'ESPN' : realgm && rotowire ? 'RotoWire' : espn && rotowire ? 'RotoWire' : null
  const validation = buildValidation(primary, secondary, secondaryName || 'secondary source')
  const season = seasonStart()

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=7200')
  return res.status(200).json({
    teamAbbr,
    teamName,
    season,
    seasonLabel: `${season}-${String(season + 1).slice(-2)}`,
    provider: primaryName,
    chart: primary.chart,
    starters: primary.starters,
    validation,
    sources: {
      realgm: { ok: Boolean(realgm), url: REALGM_URL },
      espn: { ok: Boolean(espn), url: ESPN_DEPTH_URL },
      rotowire: { ok: Boolean(rotowire), url: ROTOWIRE_URL },
    },
    verifiedAt: new Date().toISOString(),
  })
}
