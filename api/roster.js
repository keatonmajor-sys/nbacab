import * as cheerio from 'cheerio'

const BDL_BASE_URL = 'https://api.balldontlie.io/v1'
const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
const NBA_OFFSEASON_URL = 'https://www.nba.com/news/nba-offseason-deals-2026'

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

// Emergency, source-backed overrides protect NBACAB when a structured roster feed lags.
// They are intentionally tiny and should be removed once BDL/ESPN both reflect the move.
const VERIFIED_OVERRIDES = [
  {
    player: 'Jonathan Kuminga', from: 'ATL', to: 'MIN', effective: '2026-08-26',
    source: 'NBA.com', sourceUrl: 'https://www.nba.com/news/jonathan-kuminga-wolves-free-agency',
    reason: 'Agreed to a two-year deal with Minnesota.',
  },
  {
    player: 'Josh Green', from: 'MIN', to: 'UTA', effective: '2026-08-29',
    source: 'NBA.com', sourceUrl: 'https://www.nba.com/news/jazz-trade-cody-williams-john-konchar-to-timberwolves-for-josh-green',
    reason: 'Official trade to Utah.',
  },
  {
    player: 'Cody Williams', from: 'UTA', to: 'MIN', effective: '2026-08-29',
    source: 'NBA.com', sourceUrl: 'https://www.nba.com/news/jazz-trade-cody-williams-john-konchar-to-timberwolves-for-josh-green',
    reason: 'Official trade to Minnesota.',
  },
  {
    player: 'John Konchar', from: 'UTA', to: 'MIN', effective: '2026-08-29',
    source: 'NBA.com', sourceUrl: 'https://www.nba.com/news/jazz-trade-cody-williams-john-konchar-to-timberwolves-for-josh-green',
    reason: 'Official trade to Minnesota, then waived; transaction feed can supersede this row.',
    destinationStatus: 'waived',
  },
]

function normalizeName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function cleanText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim()
}

function collectEspnAthletes(value, result = []) {
  if (!value) return result
  if (Array.isArray(value)) {
    for (const item of value) collectEspnAthletes(item, result)
    return result
  }
  if (typeof value !== 'object') return result

  const looksLikeAthlete =
    (value.displayName || value.fullName || value.shortName) &&
    (value.id || value.uid) &&
    (value.headshot || value.position || value.jersey)
  if (looksLikeAthlete) result.push(value)

  for (const [key, child] of Object.entries(value)) {
    if (['headshot', 'position', 'team', 'links'].includes(key)) continue
    if (child && typeof child === 'object') collectEspnAthletes(child, result)
  }
  return result
}

function espnHeadshotUrl(athlete) {
  if (athlete?.headshot?.href) return athlete.headshot.href
  if (athlete?.id) return `https://a.espncdn.com/i/headshots/nba/players/full/${athlete.id}.png`
  return null
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || payload?.error || `${response.status} from ${url}`)
  return payload
}

async function getEspnRoster(teamAbbr) {
  if (!teamAbbr) return []
  try {
    const payload = await fetchJson(`${ESPN_BASE_URL}/teams/${teamAbbr.toLowerCase()}/roster`, {
      headers: { Accept: 'application/json' },
    })
    const athletes = collectEspnAthletes(payload)
    const seen = new Set()
    return athletes.filter((athlete) => {
      const key = athlete.id || normalizeName(athlete.displayName || athlete.fullName)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  } catch (error) {
    console.warn('NBACAB ESPN roster lookup failed:', error)
    return []
  }
}

async function fetchNbaOffseasonHtml() {
  const response = await fetch(NBA_OFFSEASON_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; NBACAB/1.0; +https://nbacab.vercel.app)',
    },
  })
  if (!response.ok) throw new Error(`NBA offseason tracker returned ${response.status}`)
  return response.text()
}

function extractPlayerNameFromTransaction(text = '') {
  let value = cleanText(text)
  value = value.replace(/^[•·\-*]+\s*/, '')
  // NBA tracker lines generally read “Player Name agrees/joins/departs/returns/…”
  const stop = value.search(/\s+(?:agrees|joins|departs|returns|re-signs|re-signing|signs|signed|acquired|traded|waived|is waived|option|heads|moves)\b/i)
  if (stop > 0) value = value.slice(0, stop)
  value = value.replace(/\s*\([^)]*\)\s*$/, '').trim()
  if (!value || value.length > 60 || !/[A-Za-z]/.test(value)) return null
  return value
}

function parseNbaTeamTransactions(html, teamAbbr) {
  const teamName = TEAM_NAMES[teamAbbr]
  if (!teamName || !html) return { additions: [], departures: [], found: false }
  const $ = cheerio.load(html)
  const target = teamName.toLowerCase()
  let teamHeading = null

  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    if (teamHeading) return
    const text = cleanText($(el).text()).toLowerCase()
    if (text === target || text.includes(target)) teamHeading = $(el)
  })
  if (!teamHeading?.length) return { additions: [], departures: [], found: false }

  const additions = []
  const departures = []
  let mode = null
  let node = teamHeading.next()

  while (node?.length) {
    const tag = String(node[0]?.tagName || '').toLowerCase()
    const text = cleanText(node.text())
    const lower = text.toLowerCase()

    if (/^h[1-6]$/.test(tag) && lower.includes('logo') === false && Object.values(TEAM_NAMES).some((name) => lower.includes(name.toLowerCase()))) break
    if (/^additions?$/.test(lower)) { mode = 'additions'; node = node.next(); continue }
    if (/^departures?$/.test(lower)) { mode = 'departures'; node = node.next(); continue }
    if (/^re-signing$/.test(lower) || /^re-signings$/.test(lower) || /^extensions?$/.test(lower)) { mode = 'additions'; node = node.next(); continue }

    if (mode && (tag === 'ul' || tag === 'ol')) {
      node.find('li').each((_, li) => {
        const name = extractPlayerNameFromTransaction($(li).text())
        if (!name) return
        const list = mode === 'additions' ? additions : departures
        if (!list.some((x) => normalizeName(x) === normalizeName(name))) list.push(name)
      })
    } else if (mode && tag === 'p') {
      const name = extractPlayerNameFromTransaction(text)
      if (name) {
        const list = mode === 'additions' ? additions : departures
        if (!list.some((x) => normalizeName(x) === normalizeName(name))) list.push(name)
      }
    }
    node = node.next()
  }

  return { additions, departures, found: true }
}

function effectiveOverridesForTeam(teamAbbr) {
  const additions = []
  const departures = []
  const details = []
  for (const row of VERIFIED_OVERRIDES) {
    if (row.from === teamAbbr) {
      departures.push(row.player)
      details.push({ ...row, action: 'remove' })
    }
    if (row.to === teamAbbr && row.destinationStatus !== 'waived') {
      additions.push(row.player)
      details.push({ ...row, action: 'add' })
    }
    if (row.to === teamAbbr && row.destinationStatus === 'waived') {
      departures.push(row.player)
      details.push({ ...row, action: 'remove-after-add' })
    }
  }
  return { additions, departures, details }
}

async function searchBdlPlayer(name, apiKey) {
  try {
    const params = new URLSearchParams({ search: name, per_page: '25' })
    const payload = await fetchJson(`${BDL_BASE_URL}/players?${params.toString()}`, {
      headers: { Authorization: apiKey, Accept: 'application/json' },
    })
    const candidates = Array.isArray(payload?.data) ? payload.data : []
    const exact = candidates.find((player) => normalizeName(`${player.first_name || ''} ${player.last_name || ''}`) === normalizeName(name))
    return exact || candidates[0] || null
  } catch (error) {
    console.warn(`NBACAB BDL player search failed for ${name}:`, error)
    return null
  }
}

function uniqueNames(names = []) {
  const seen = new Set()
  return names.filter((name) => {
    const key = normalizeName(name)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.BALLDONTLIE_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'BALLDONTLIE_API_KEY is not configured on the server.' })

  const teamId = Number(req.query.teamId)
  const teamAbbr = String(req.query.teamAbbr || '').trim().toUpperCase()
  if (!Number.isInteger(teamId) || teamId < 1 || teamId > 30) {
    return res.status(400).json({ error: 'A valid NBA teamId from 1 to 30 is required.' })
  }

  try {
    const params = new URLSearchParams()
    params.append('team_ids[]', String(teamId))
    params.set('per_page', '100')

    const [bdlResult, espnResult, nbaTrackerResult] = await Promise.allSettled([
      fetchJson(`${BDL_BASE_URL}/players/active?${params.toString()}`, {
        headers: { Authorization: apiKey, Accept: 'application/json' },
      }),
      getEspnRoster(teamAbbr),
      fetchNbaOffseasonHtml(),
    ])

    if (bdlResult.status === 'rejected') throw bdlResult.reason
    const payload = bdlResult.value
    const espnAthletes = espnResult.status === 'fulfilled' ? espnResult.value : []
    const nbaTransactions = nbaTrackerResult.status === 'fulfilled'
      ? parseNbaTeamTransactions(nbaTrackerResult.value, teamAbbr)
      : { additions: [], departures: [], found: false }
    const emergency = effectiveOverridesForTeam(teamAbbr)

    const additions = uniqueNames([...nbaTransactions.additions, ...emergency.additions])
    const departures = uniqueNames([...nbaTransactions.departures, ...emergency.departures])
    const departureKeys = new Set(departures.map(normalizeName))

    const basePlayers = Array.isArray(payload?.data) ? payload.data : []
    let players = basePlayers.filter((player) => !departureKeys.has(normalizeName(`${player.first_name || ''} ${player.last_name || ''}`)))
    const removed = basePlayers.filter((player) => departureKeys.has(normalizeName(`${player.first_name || ''} ${player.last_name || ''}`)))
      .map((player) => `${player.first_name || ''} ${player.last_name || ''}`.trim())

    const currentKeys = new Set(players.map((player) => normalizeName(`${player.first_name || ''} ${player.last_name || ''}`)))
    const missingAdditions = additions.filter((name) => !currentKeys.has(normalizeName(name)))
    const foundAdditions = await Promise.all(missingAdditions.map((name) => searchBdlPlayer(name, apiKey)))
    const added = []
    for (let i = 0; i < missingAdditions.length; i += 1) {
      const player = foundAdditions[i]
      if (!player || currentKeys.has(normalizeName(`${player.first_name || ''} ${player.last_name || ''}`))) continue
      players.push({ ...player, nbacab_roster_override: true, nbacab_override_team: teamAbbr })
      currentKeys.add(normalizeName(`${player.first_name || ''} ${player.last_name || ''}`))
      added.push(missingAdditions[i])
    }

    const espnByName = new Map()
    for (const athlete of espnAthletes) {
      for (const name of [athlete.displayName, athlete.fullName, athlete.shortName]) {
        const key = normalizeName(name)
        if (key && !espnByName.has(key)) espnByName.set(key, athlete)
      }
    }

    const espnNames = new Set([...espnByName.keys()])
    players = players.map((player) => {
      const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim()
      const key = normalizeName(fullName)
      const athlete = espnByName.get(key)
      const transactionAdded = additions.some((name) => normalizeName(name) === key)
      return {
        ...player,
        image_url: espnHeadshotUrl(athlete),
        espn_id: athlete?.id || null,
        nbacab_roster_source: player.nbacab_roster_override ? 'NBA transaction override' : 'BALLDONTLIE',
        nbacab_espn_confirmed: espnNames.has(key),
        nbacab_transaction_confirmed: transactionAdded,
      }
    })

    const imageMatches = players.filter((player) => player.image_url).length
    const espnRosterNames = espnAthletes.map((athlete) => cleanText(athlete.displayName || athlete.fullName || athlete.shortName)).filter(Boolean)
    const reconciledKeys = new Set(players.map((player) => normalizeName(`${player.first_name || ''} ${player.last_name || ''}`)))
    const espnOnly = espnRosterNames.filter((name) => !reconciledKeys.has(normalizeName(name)))
    const bdlOnly = players.filter((player) => !player.nbacab_espn_confirmed).map((player) => `${player.first_name || ''} ${player.last_name || ''}`.trim())

    const verifiedAt = new Date().toISOString()
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900')
    return res.status(200).json({
      data: players,
      meta: payload?.meta ?? null,
      teamId,
      teamAbbr,
      imageMatches,
      fetchedAt: verifiedAt,
      rosterVerification: {
        verifiedAt,
        status: nbaTransactions.found || emergency.details.length ? 'reconciled' : 'primary-only',
        sources: {
          balldontlie: true,
          espn: espnResult.status === 'fulfilled' && espnAthletes.length > 0,
          nbaOffseasonTracker: nbaTrackerResult.status === 'fulfilled' && nbaTransactions.found,
          verifiedOverrides: emergency.details.length > 0,
        },
        bdlCount: basePlayers.length,
        reconciledCount: players.length,
        additionsRequested: additions,
        departuresRequested: departures,
        additionsApplied: added,
        departuresApplied: removed,
        unresolvedAdditions: missingAdditions.filter((name) => !added.some((x) => normalizeName(x) === normalizeName(name))),
        espnOnly,
        bdlOnly,
        overrides: emergency.details,
      },
    })
  } catch (error) {
    console.error('NBACAB roster reconciliation error:', error)
    return res.status(500).json({ error: 'Unable to load and reconcile the roster right now.' })
  }
}
