import * as cheerio from 'cheerio'

const BDL_BASE = 'https://api.balldontlie.io/v1/contracts'
const SPOTRAC_TEAM_SLUG = {
  ATL: 'atlanta-hawks', BOS: 'boston-celtics', BKN: 'brooklyn-nets', CHA: 'charlotte-hornets',
  CHI: 'chicago-bulls', CLE: 'cleveland-cavaliers', DAL: 'dallas-mavericks', DEN: 'denver-nuggets',
  DET: 'detroit-pistons', GSW: 'golden-state-warriors', HOU: 'houston-rockets', IND: 'indiana-pacers',
  LAC: 'los-angeles-clippers', LAL: 'los-angeles-lakers', MEM: 'memphis-grizzlies', MIA: 'miami-heat',
  MIL: 'milwaukee-bucks', MIN: 'minnesota-timberwolves', NOP: 'new-orleans-pelicans', NYK: 'new-york-knicks',
  OKC: 'oklahoma-city-thunder', ORL: 'orlando-magic', PHI: 'philadelphia-76ers', PHX: 'phoenix-suns',
  POR: 'portland-trail-blazers', SAC: 'sacramento-kings', SAS: 'san-antonio-spurs', TOR: 'toronto-raptors',
  UTA: 'utah-jazz', WAS: 'washington-wizards',
}

function currentContractSeasonStartYear(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return month >= 6 ? year : year - 1
}

function normalizeName(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseMoney(value) {
  if (value == null) return null
  const cleaned = String(value).replace(/[^0-9.-]/g, '')
  if (!cleaned) return null
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : null
}

function seasonFromText(value = '') {
  const match = String(value).match(/(20\d{2})\s*[-–]\s*\d{2,4}/)
  return match ? Number(match[1]) : null
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; NBACAB/1.0; +https://nbacab.vercel.app)',
    },
  })
  if (!response.ok) throw new Error(`Fallback source returned ${response.status}.`)
  return response.text()
}

async function bdlGet(url, apiKey) {
  const response = await fetch(url, { headers: { Authorization: apiKey, Accept: 'application/json' } })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || 'BALLDONTLIE contract request failed.')
    error.status = response.status
    throw error
  }
  return payload
}

function readTableHeaders($, table) {
  const rows = $(table).find('thead tr')
  const headerRow = rows.length ? rows.last() : $(table).find('tr').first()
  return headerRow.find('th,td').map((_, cell) => $(cell).text().replace(/\s+/g, ' ').trim().toLowerCase()).get()
}

function headerIndex(headers, candidates) {
  return headers.findIndex((header) => candidates.some((candidate) => header.includes(candidate)))
}

function parseSpotracTeam(html, season) {
  const $ = cheerio.load(html)
  let table = null
  const headingNeedle = `${season}-${String(season + 1).slice(-2)} active roster`
  $('h1,h2,h3,h4,h5').each((_, heading) => {
    if (table) return
    const text = $(heading).text().replace(/\s+/g, ' ').trim().toLowerCase()
    if (text.includes(headingNeedle) || (text.includes('active roster') && text.includes(String(season)))) {
      const candidate = $(heading).nextAll('table').first()
      if (candidate.length) table = candidate
    }
  })

  if (!table) {
    $('table').each((_, candidate) => {
      if (table) return
      const headers = readTableHeaders($, candidate)
      if (headers.some((h) => h.includes('player')) && headers.some((h) => h.includes('cap hit'))) table = $(candidate)
    })
  }

  const byName = {}
  if (table?.length) {
    const headers = readTableHeaders($, table)
    const capIndex = headerIndex(headers, ['cap hit'])
    const baseIndex = headerIndex(headers, ['base salary'])
    const cashIndex = headerIndex(headers, ['cash total', 'cash'])
    const guaranteedIndex = headerIndex(headers, ['guaranteed'])
    const faIndex = headerIndex(headers, ['free agent year', 'free agent'])
    const typeIndex = headerIndex(headers, ['contract type', 'type', 'status'])

    $(table).find('tbody tr').each((_, row) => {
      const cells = $(row).find('td,th')
      if (!cells.length) return
      const playerLink = $(row).find('a[href*="/nba/player/"]').first()
      let name = playerLink.text().replace(/\s+/g, ' ').trim()
      if (!name) {
        const likelyName = cells.toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim()).find((text) => /^[A-Za-zÀ-ÿ.'’ -]{4,}$/.test(text) && !/^(player|pos|age|type)$/i.test(text))
        name = likelyName || ''
      }
      if (!name) return
      const values = cells.toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      const capHit = capIndex >= 0 ? parseMoney(values[capIndex]) : null
      const baseSalary = baseIndex >= 0 ? parseMoney(values[baseIndex]) : null
      const cashTotal = cashIndex >= 0 ? parseMoney(values[cashIndex]) : null
      if (capHit == null && baseSalary == null && cashTotal == null) return
      const href = playerLink.attr('href') || null
      byName[normalizeName(name)] = {
        player_name: name,
        season,
        cap_hit: capHit,
        base_salary: baseSalary,
        cash_total: cashTotal,
        guaranteed: guaranteedIndex >= 0 ? parseMoney(values[guaranteedIndex]) : null,
        free_agent_year: faIndex >= 0 ? Number(String(values[faIndex]).match(/20\d{2}/)?.[0] || 0) || null : null,
        contract_type: typeIndex >= 0 ? values[typeIndex] || null : null,
        spotrac_path: href,
        source: 'Spotrac',
        source_type: 'fallback',
        cap_hit_exact: capHit != null,
      }
    })
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ')
  const findMoneyAfter = (label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = bodyText.match(new RegExp(`${escaped}\\s*\\$([0-9,]+)`, 'i'))
    return match ? parseMoney(match[1]) : null
  }

  return {
    byName,
    teamCap: {
      source: 'Spotrac',
      totalCap: findMoneyAfter('Total Cap'),
      activeRoster: findMoneyAfter('Active Roster'),
      capSpace: findMoneyAfter('Cap Space'),
      firstApronSpace: findMoneyAfter('1st Apron Space'),
      secondApronSpace: findMoneyAfter('2nd Apron Space'),
    },
  }
}

function parseBasketballReferenceContracts(html, season) {
  const $ = cheerio.load(html.replace(/<!--/g, '').replace(/-->/g, ''))
  const byName = {}
  $('table').each((_, table) => {
    const headers = readTableHeaders($, table)
    const playerIndex = headerIndex(headers, ['player'])
    const seasonLabel = `${season}-${String(season + 1).slice(-2)}`.toLowerCase()
    const seasonIndex = headers.findIndex((header) => header.includes(seasonLabel))
    if (playerIndex < 0 || seasonIndex < 0) return

    $(table).find('tbody tr').each((_, row) => {
      const cells = $(row).find('th,td')
      const values = cells.toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      const name = values[playerIndex]
      const salary = parseMoney(values[seasonIndex])
      if (!name || salary == null) return
      byName[normalizeName(name)] = {
        player_name: name,
        season,
        base_salary: salary,
        cap_hit: null,
        source: 'Basketball Reference',
        source_type: 'fallback',
        cap_hit_exact: false,
      }
    })
  })
  return byName
}

function parseSpotracPlayer(html) {
  const $ = cheerio.load(html)
  const yearsBySeason = new Map()

  $('table').each((_, table) => {
    const headers = readTableHeaders($, table)
    const yearIndex = headerIndex(headers, ['year'])
    const capIndex = headerIndex(headers, ['cap hit'])
    const baseIndex = headerIndex(headers, ['base salary'])
    const cashIndex = headerIndex(headers, ['cash total'])
    const statusIndex = headerIndex(headers, ['status'])
    if (yearIndex < 0 || (capIndex < 0 && baseIndex < 0 && cashIndex < 0)) return

    $(table).find('tbody tr').each((_, row) => {
      const cells = $(row).find('th,td')
      const values = cells.toArray().map((cell) => $(cell).text().replace(/\s+/g, ' ').trim())
      const season = seasonFromText(values[yearIndex])
      if (!season) return
      const next = {
        season,
        cap_hit: capIndex >= 0 ? parseMoney(values[capIndex]) : null,
        base_salary: baseIndex >= 0 ? parseMoney(values[baseIndex]) : null,
        cash_total: cashIndex >= 0 ? parseMoney(values[cashIndex]) : null,
        status: statusIndex >= 0 ? values[statusIndex] || null : null,
        source: 'Spotrac',
      }
      const existing = yearsBySeason.get(season) || {}
      yearsBySeason.set(season, {
        ...existing,
        ...Object.fromEntries(Object.entries(next).filter(([, value]) => value != null && value !== '')),
      })
    })
  })

  const years = [...yearsBySeason.values()].sort((a, b) => a.season - b.season)
  const bodyText = $('body').text().replace(/\s+/g, ' ')
  const contractMatch = bodyText.match(/signed\s+(?:a|an)\s+(\d+)\s*year[^$]*\$([0-9,.]+)\s*million/i)
  const totalValue = contractMatch ? Math.round(Number(contractMatch[2].replace(/,/g, '')) * 1000000) : null
  const contractYears = contractMatch ? Number(contractMatch[1]) : null
  return { years, aggregate: totalValue ? { total_value: totalValue, contract_years: contractYears, average_salary: contractYears ? Math.round(totalValue / contractYears) : null } : null }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.BALLDONTLIE_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'BALLDONTLIE_API_KEY is not configured on the server.' })

  const playerId = Number(req.query.playerId)
  const teamId = Number(req.query.teamId)
  const teamAbbr = String(req.query.teamAbbr || '').toUpperCase()
  const spotracPath = typeof req.query.spotracPath === 'string' ? req.query.spotracPath : ''
  const season = Number.isInteger(Number(req.query.season)) ? Number(req.query.season) : currentContractSeasonStartYear()

  try {
    if (Number.isInteger(playerId) && playerId > 0) {
      const [yearsResult, aggregateResult, spotracResult] = await Promise.allSettled([
        bdlGet(`${BDL_BASE}/players?player_id=${playerId}&per_page=100`, apiKey),
        bdlGet(`${BDL_BASE}/players/aggregate?player_id=${playerId}`, apiKey),
        spotracPath ? fetchText(spotracPath.startsWith('http') ? spotracPath : `https://www.spotrac.com${spotracPath}`) : Promise.resolve(null),
      ])

      const bdlYears = yearsResult.status === 'fulfilled' && Array.isArray(yearsResult.value?.data) ? yearsResult.value.data : []
      const bdlAggregates = aggregateResult.status === 'fulfilled' && Array.isArray(aggregateResult.value?.data) ? aggregateResult.value.data : []
      const spotrac = spotracResult.status === 'fulfilled' && spotracResult.value ? parseSpotracPlayer(spotracResult.value) : { years: [], aggregate: null }
      const bdlHasCurrent = bdlYears.some((row) => Number(row.season) >= season)
      const years = bdlHasCurrent ? bdlYears : (spotrac.years.length ? spotrac.years : bdlYears)
      const aggregates = bdlHasCurrent && bdlAggregates.length ? bdlAggregates : (spotrac.aggregate ? [spotrac.aggregate] : bdlAggregates)

      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
      return res.status(200).json({
        playerId,
        season,
        years,
        aggregates,
        detailSource: bdlHasCurrent ? 'BALLDONTLIE' : spotrac.years.length ? 'Spotrac' : 'BALLDONTLIE',
      })
    }

    if (!Number.isInteger(teamId) || teamId <= 0) return res.status(400).json({ error: 'A valid teamId or playerId is required.' })

    const spotracSlug = SPOTRAC_TEAM_SLUG[teamAbbr]
    const spotracUrl = spotracSlug ? `https://www.spotrac.com/nba/${spotracSlug}/cap/_/year/${season}` : null
    const brefUrl = 'https://www.basketball-reference.com/contracts/players.html'

    const [bdlResult, spotracResult, brefResult] = await Promise.allSettled([
      bdlGet(`${BDL_BASE}/teams?team_id=${teamId}&season=${season}`, apiKey),
      spotracUrl ? fetchText(spotracUrl) : Promise.resolve(null),
      fetchText(brefUrl),
    ])

    if (bdlResult.status === 'rejected' && spotracResult.status === 'rejected' && brefResult.status === 'rejected') {
      throw bdlResult.reason || new Error('Unable to load contract sources.')
    }

    const contracts = bdlResult.status === 'fulfilled' && Array.isArray(bdlResult.value?.data) ? bdlResult.value.data : []
    const byPlayer = Object.fromEntries(contracts.map((contract) => [contract.player_id, { ...contract, source: 'BALLDONTLIE', source_type: 'primary', cap_hit_exact: contract.cap_hit != null }]))
    const spotrac = spotracResult.status === 'fulfilled' && spotracResult.value ? parseSpotracTeam(spotracResult.value, season) : { byName: {}, teamCap: null }
    const brefByName = brefResult.status === 'fulfilled' && brefResult.value ? parseBasketballReferenceContracts(brefResult.value, season) : {}

    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
    return res.status(200).json({
      season,
      seasonLabel: `${season}-${String(season + 1).slice(-2)}`,
      contracts,
      byPlayer,
      spotracByName: spotrac.byName,
      brefByName,
      teamCap: spotrac.teamCap,
      sources: {
        balldontlie: bdlResult.status === 'fulfilled',
        spotrac: spotracResult.status === 'fulfilled',
        basketballReference: brefResult.status === 'fulfilled',
      },
    })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Unable to load contracts.' })
  }
}
