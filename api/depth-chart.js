import * as cheerio from 'cheerio'

const REALGM_URL = 'https://basketball.realgm.com/nba/depth-charts'
const ROTOWIRE_URL = 'https://www.rotowire.com/basketball/nba-depth-charts.php'
const ESPN_CORE_BASE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba'

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

// ESPN's NBA team IDs are stable and differ from BALLDONTLIE IDs for several clubs.
const ESPN_TEAM_IDS = {
  ATL: 1, BOS: 2, BKN: 17, CHA: 30, CHI: 4, CLE: 5, DAL: 6, DEN: 7, DET: 8, GSW: 9,
  HOU: 10, IND: 11, LAC: 12, LAL: 13, MEM: 29, MIA: 14, MIL: 15, MIN: 16, NOP: 3,
  NYK: 18, OKC: 25, ORL: 19, PHI: 20, PHX: 21, POR: 22, SAC: 23, SAS: 24, TOR: 28,
  UTA: 26, WAS: 27,
}

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']

function clean(value = '') { return String(value).replace(/\s+/g, ' ').trim() }
function norm(value = '') {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}
function seasonStart(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return month >= 6 ? year : year - 1
}
function blankChart() { return Object.fromEntries(POSITIONS.map((p) => [p, []])) }

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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; NBACAB/1.0; +https://nbacab.vercel.app)',
    },
  })
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`)
  return response.json()
}

function playerText(cell, $) {
  const links = $(cell).find('a')
  if (links.length) {
    const candidate = clean(links.first().text())
    if (candidate) return candidate
  }
  const text = clean($(cell).clone().children().remove().end().text()) || clean($(cell).text())
  return text.replace(/\b\d+(?:\.\d+)?\s*[prab]\b.*$/i, '').trim()
}

function tableHasPositions(table, $) {
  const headers = $(table).find('tr').first().find('th,td').map((_, c) => clean($(c).text()).toUpperCase()).get()
  return POSITIONS.every((p) => headers.includes(p))
}

// RealGM's page is a league-wide document. Pairing depth-chart headings and tables by
// document order is more resilient than assuming the table is a direct sibling of the h2.
function findRealGmTeamTable($, teamName) {
  const target = norm(teamName)
  const headings = $('h1,h2,h3,h4').toArray().filter((el) => {
    const text = clean($(el).text()).replace(/\d{4}-\d{4}/g, '').replace(/depth chart/ig, '')
    const n = norm(text)
    return n && (n.includes(target) || target.includes(n))
  })

  for (const heading of headings) {
    const headingIndex = $(heading).index()
    let node = $(heading).next()
    let steps = 0
    while (node?.length && steps < 40) {
      const tag = String(node[0]?.tagName || '').toLowerCase()
      if (/^h[1-4]$/.test(tag) && node[0] !== heading) break
      if (tag === 'table' && tableHasPositions(node, $)) return node
      const nestedTables = node.find('table').toArray()
      for (const table of nestedTables) {
        if (tableHasPositions(table, $)) return $(table)
      }
      node = node.next()
      steps += 1
    }
    void headingIndex
  }

  // Final fallback: pair all depth-chart headings and all 5-position tables in document order.
  const depthHeadings = $('h1,h2,h3,h4').toArray().filter((el) => /depth chart/i.test(clean($(el).text())))
  const depthTables = $('table').toArray().filter((table) => tableHasPositions(table, $))
  const headingIndex = depthHeadings.findIndex((el) => {
    const t = norm(clean($(el).text()).replace(/\d{4}-\d{4}/g, '').replace(/depth chart/ig, ''))
    return t && (t.includes(target) || target.includes(t))
  })
  if (headingIndex >= 0 && depthTables[headingIndex]) return $(depthTables[headingIndex])

  return null
}

function parseRealGM(html, teamName) {
  const $ = cheerio.load(html)
  const table = findRealGmTeamTable($, teamName)
  if (!table?.length) return null
  const chart = blankChart()
  let starters = null

  table.find('tr').each((_, row) => {
    const cells = $(row).find('th,td').toArray()
    if (cells.length < 6) return
    const role = clean($(cells[0]).text())
    if (!/^(starters?|rotation|lim(?:ited)?\s*pt)/i.test(role)) return
    const rowPlayers = {}
    POSITIONS.forEach((pos, i) => {
      const name = playerText(cells[i + 1], $)
      if (!name || /^(?:-|—|n\/a)$/i.test(name)) return
      if (!chart[pos].some((existing) => norm(existing) === norm(name))) chart[pos].push(name)
      rowPlayers[pos] = name
    })
    if (/^starters?/i.test(role)) starters = rowPlayers
  })

  if (!POSITIONS.some((p) => chart[p].length)) return null
  return {
    chart,
    starters: starters || Object.fromEntries(POSITIONS.map((p) => [p, chart[p][0] || null])),
  }
}

function extractEspnPositionKey(position, fallbackKey = '') {
  const candidates = [
    position?.abbreviation,
    position?.name,
    position?.displayName,
    position?.shortName,
    fallbackKey,
  ].map((x) => clean(x).toUpperCase())
  return POSITIONS.find((p) => candidates.some((candidate) => candidate === p || candidate.startsWith(`${p} `))) || null
}

function extractAthleteIdFromRef(ref = '') {
  const match = String(ref).match(/\/athletes\/(\d+)/)
  return match?.[1] || null
}

function athleteDisplayName(payload) {
  return clean(payload?.displayName || payload?.fullName || payload?.shortName || `${payload?.firstName || ''} ${payload?.lastName || ''}`)
}

// ESPN Core is JSON and therefore serves as a genuinely independent fallback instead of
// relying on the shape of ESPN's rendered web page.
async function fetchEspnDepthChart(teamAbbr, season) {
  const teamId = ESPN_TEAM_IDS[teamAbbr]
  if (!teamId) return null
  const espnSeason = season + 1
  const url = `${ESPN_CORE_BASE}/seasons/${espnSeason}/teams/${teamId}/depthcharts?lang=en&region=us`
  const payload = await fetchJson(url)
  const items = Array.isArray(payload?.items) ? payload.items : []
  if (!items.length) return null

  const chart = blankChart()
  const athleteCache = new Map()

  async function resolveAthlete(athlete) {
    const inline = athlete?.athlete || athlete
    const inlineName = athleteDisplayName(inline)
    if (inlineName) return inlineName
    const ref = inline?.$ref || athlete?.athlete?.$ref || athlete?.$ref
    if (!ref) return null
    const id = extractAthleteIdFromRef(ref) || ref
    if (!athleteCache.has(id)) {
      athleteCache.set(id, fetchJson(ref).then(athleteDisplayName).catch(() => null))
    }
    return athleteCache.get(id)
  }

  const work = []
  for (const item of items) {
    const positions = item?.positions || {}
    for (const [fallbackKey, position] of Object.entries(positions)) {
      const key = extractEspnPositionKey(position?.position, fallbackKey)
      if (!key) continue
      const athletes = Array.isArray(position?.athletes) ? [...position.athletes] : []
      athletes.sort((a, b) => Number(a?.rank ?? 999) - Number(b?.rank ?? 999))
      work.push((async () => {
        for (const entry of athletes) {
          const name = await resolveAthlete(entry)
          if (name && !chart[key].some((existing) => norm(existing) === norm(name))) chart[key].push(name)
        }
      })())
    }
  }
  await Promise.all(work)

  if (!POSITIONS.some((p) => chart[p].length)) return null
  return {
    chart,
    starters: Object.fromEntries(POSITIONS.map((p) => [p, chart[p][0] || null])),
    url,
  }
}

function parseRotoWire(html, teamName, teamAbbr) {
  const $ = cheerio.load(html)
  const aliases = [teamName, teamAbbr]
  let root = null
  $('[data-team], .depth-chart, .depthchart, .nba-depth-chart, article, section').each((_, el) => {
    if (root) return
    const text = clean($(el).text()).slice(0, 300)
    if (aliases.some((a) => norm(text).includes(norm(a))) && POSITIONS.filter((p) => text.toUpperCase().includes(p)).length >= 3) root = $(el)
  })
  if (!root?.length) return null

  const chart = blankChart()
  const tables = root.is('table') ? root : root.find('table')
  let table = null
  tables.each((_, t) => {
    if (table) return
    if (tableHasPositions(t, $)) table = $(t)
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

function buildValidation(primary, secondary, primaryName, secondaryName) {
  if (!primary) return { confidence: 'unavailable', agreements: 0, conflicts: [], checked: 0 }
  if (!secondary) return {
    confidence: 'medium', agreements: 0, conflicts: [], checked: 0,
    note: `${primaryName} projection available; secondary validation unavailable.`,
  }
  let agreements = 0
  const conflicts = []
  for (const p of POSITIONS) {
    const a = primary.starters?.[p]
    const b = secondary.starters?.[p]
    if (!a || !b) continue
    if (namesLikelyMatch(a, b)) agreements += 1
    else conflicts.push({ position: p, primary: a, secondary: b })
  }
  const checked = agreements + conflicts.length
  const confidence = checked >= 4 && agreements >= 4 ? 'high' : checked >= 3 && agreements >= 2 ? 'medium' : 'low'
  return { confidence, agreements, conflicts, checked, primary: primaryName, secondary: secondaryName }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const teamAbbr = String(req.query.teamAbbr || '').toUpperCase().trim()
  const teamName = TEAM_NAMES[teamAbbr]
  if (!teamName) return res.status(400).json({ error: 'A valid NBA teamAbbr is required.' })

  const season = seasonStart()
  const [realgmResult, espnResult, rotowireResult] = await Promise.allSettled([
    fetchHtml(REALGM_URL),
    fetchEspnDepthChart(teamAbbr, season),
    fetchHtml(ROTOWIRE_URL),
  ])

  const realgm = realgmResult.status === 'fulfilled' ? parseRealGM(realgmResult.value, teamName) : null
  const espn = espnResult.status === 'fulfilled' ? espnResult.value : null
  const rotowire = rotowireResult.status === 'fulfilled' ? parseRotoWire(rotowireResult.value, teamName, teamAbbr) : null

  if (!realgm && !espn && !rotowire) {
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900')
    return res.status(502).json({
      error: 'Projected depth-chart sources are temporarily unavailable.',
      sources: {
        realgm: { ok: false, error: realgmResult.status === 'rejected' ? realgmResult.reason?.message : 'Unable to parse team depth chart.' },
        espn: { ok: false, error: espnResult.status === 'rejected' ? espnResult.reason?.message : 'Unable to parse ESPN Core depth chart.' },
        rotowire: { ok: false, error: rotowireResult.status === 'rejected' ? rotowireResult.reason?.message : 'Unable to parse team depth chart.' },
      },
    })
  }

  const primary = realgm || espn || rotowire
  const primaryName = realgm ? 'RealGM' : espn ? 'ESPN' : 'RotoWire'
  const secondary = primaryName === 'RealGM' ? (espn || rotowire) : primaryName === 'ESPN' ? rotowire : null
  const secondaryName = primaryName === 'RealGM' && espn ? 'ESPN' : primaryName === 'RealGM' && rotowire ? 'RotoWire' : primaryName === 'ESPN' && rotowire ? 'RotoWire' : null
  const validation = buildValidation(primary, secondary, primaryName, secondaryName || 'secondary source')

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800')
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
      realgm: {
        ok: Boolean(realgm),
        fetchOk: realgmResult.status === 'fulfilled',
        url: REALGM_URL,
        error: realgmResult.status === 'rejected' ? realgmResult.reason?.message : realgm ? null : 'Fetched, but team table did not parse.',
      },
      espn: {
        ok: Boolean(espn),
        fetchOk: espnResult.status === 'fulfilled',
        url: espn?.url || `${ESPN_CORE_BASE}/seasons/${season + 1}/teams/${ESPN_TEAM_IDS[teamAbbr]}/depthcharts?lang=en&region=us`,
        error: espnResult.status === 'rejected' ? espnResult.reason?.message : espn ? null : 'Fetched, but team depth chart was empty.',
      },
      rotowire: {
        ok: Boolean(rotowire),
        fetchOk: rotowireResult.status === 'fulfilled',
        url: ROTOWIRE_URL,
        error: rotowireResult.status === 'rejected' ? rotowireResult.reason?.message : rotowire ? null : 'Fetched, but team depth chart did not parse.',
      },
    },
    verifiedAt: new Date().toISOString(),
  })
}
