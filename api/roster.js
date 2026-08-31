const BDL_BASE_URL = 'https://api.balldontlie.io/v1'
const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'

function normalizeName(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
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

async function getEspnRoster(teamAbbr) {
  if (!teamAbbr) return []

  try {
    const response = await fetch(`${ESPN_BASE_URL}/teams/${teamAbbr.toLowerCase()}/roster`, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) return []
    const payload = await response.json().catch(() => null)
    if (!payload) return []

    const athletes = collectEspnAthletes(payload)
    const seen = new Set()

    return athletes.filter((athlete) => {
      const key = athlete.id || normalizeName(athlete.displayName || athlete.fullName)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  } catch (error) {
    console.warn('NBACAB ESPN image lookup failed:', error)
    return []
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.BALLDONTLIE_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'BALLDONTLIE_API_KEY is not configured on the server.',
    })
  }

  const teamId = Number(req.query.teamId)
  const teamAbbr = String(req.query.teamAbbr || '').trim().toUpperCase()

  if (!Number.isInteger(teamId) || teamId < 1 || teamId > 30) {
    return res.status(400).json({ error: 'A valid NBA teamId from 1 to 30 is required.' })
  }

  try {
    const params = new URLSearchParams()
    params.append('team_ids[]', String(teamId))
    params.set('per_page', '100')

    const [bdlResponse, espnAthletes] = await Promise.all([
      fetch(`${BDL_BASE_URL}/players/active?${params.toString()}`, {
        headers: {
          Authorization: apiKey,
          Accept: 'application/json',
        },
      }),
      getEspnRoster(teamAbbr),
    ])

    const payload = await bdlResponse.json().catch(() => null)

    if (!bdlResponse.ok) {
      const upstreamMessage = payload?.message || payload?.error || 'BALLDONTLIE request failed.'
      return res.status(bdlResponse.status).json({
        error: upstreamMessage,
        upstreamStatus: bdlResponse.status,
      })
    }

    const espnByName = new Map()
    for (const athlete of espnAthletes) {
      const names = [athlete.displayName, athlete.fullName, athlete.shortName]
      for (const name of names) {
        const normalized = normalizeName(name)
        if (normalized && !espnByName.has(normalized)) espnByName.set(normalized, athlete)
      }
    }

    const players = (Array.isArray(payload?.data) ? payload.data : []).map((player) => {
      const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim()
      const athlete = espnByName.get(normalizeName(fullName))

      return {
        ...player,
        image_url: espnHeadshotUrl(athlete),
        espn_id: athlete?.id || null,
      }
    })

    const imageMatches = players.filter((player) => player.image_url).length

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600')
    return res.status(200).json({
      data: players,
      meta: payload?.meta ?? null,
      teamId,
      teamAbbr,
      imageMatches,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('NBACAB roster proxy error:', error)
    return res.status(500).json({ error: 'Unable to load the roster right now.' })
  }
}
