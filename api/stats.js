const BDL_STATS_URL = 'https://api.balldontlie.io/v1/stats'

function currentNbaSeasonStartYear(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return month >= 9 ? year : year - 1
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function parseMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return 0
  if (!value.includes(':')) return toNumber(value)
  const [minutes, seconds] = value.split(':').map(Number)
  return (Number.isFinite(minutes) ? minutes : 0) + (Number.isFinite(seconds) ? seconds / 60 : 0)
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function pct(made, attempts) {
  if (!attempts) return 0
  return round((made / attempts) * 100, 1)
}

function aggregateRows(rows, requestedPlayerIds) {
  const buckets = new Map()

  for (const playerId of requestedPlayerIds) {
    buckets.set(playerId, {
      playerId,
      gamesPlayed: 0,
      min: 0,
      pts: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      turnover: 0,
      plusMinus: 0,
      fgm: 0,
      fga: 0,
      fg3m: 0,
      fg3a: 0,
      ftm: 0,
      fta: 0,
    })
  }

  for (const row of rows) {
    const playerId = Number(row?.player?.id)
    if (!buckets.has(playerId)) continue

    const bucket = buckets.get(playerId)
    const minutes = parseMinutes(row.min)

    // BALLDONTLIE stat rows are game-level. Count a game when the player logged
    // minutes or recorded any box-score activity.
    const appeared = minutes > 0 || [row.pts, row.reb, row.ast, row.stl, row.blk, row.fga, row.fta]
      .some((value) => toNumber(value) !== 0)

    if (!appeared) continue

    bucket.gamesPlayed += 1
    bucket.min += minutes
    bucket.pts += toNumber(row.pts)
    bucket.reb += toNumber(row.reb)
    bucket.ast += toNumber(row.ast)
    bucket.stl += toNumber(row.stl)
    bucket.blk += toNumber(row.blk)
    bucket.turnover += toNumber(row.turnover)
    bucket.plusMinus += toNumber(row.plus_minus)
    bucket.fgm += toNumber(row.fgm)
    bucket.fga += toNumber(row.fga)
    bucket.fg3m += toNumber(row.fg3m)
    bucket.fg3a += toNumber(row.fg3a)
    bucket.ftm += toNumber(row.ftm)
    bucket.fta += toNumber(row.fta)
  }

  return Object.fromEntries(
    [...buckets.entries()].map(([playerId, bucket]) => {
      const gp = bucket.gamesPlayed
      return [playerId, {
        playerId,
        gamesPlayed: gp,
        min: gp ? round(bucket.min / gp, 1) : 0,
        pts: gp ? round(bucket.pts / gp, 1) : 0,
        reb: gp ? round(bucket.reb / gp, 1) : 0,
        ast: gp ? round(bucket.ast / gp, 1) : 0,
        stl: gp ? round(bucket.stl / gp, 1) : 0,
        blk: gp ? round(bucket.blk / gp, 1) : 0,
        turnover: gp ? round(bucket.turnover / gp, 1) : 0,
        plusMinus: gp ? round(bucket.plusMinus / gp, 1) : 0,
        fgPct: pct(bucket.fgm, bucket.fga),
        fg3Pct: pct(bucket.fg3m, bucket.fg3a),
        fg3m: gp ? round(bucket.fg3m / gp, 1) : 0,
        ftPct: pct(bucket.ftm, bucket.fta),
        totals: {
          pts: bucket.pts,
          reb: bucket.reb,
          ast: bucket.ast,
          stl: bucket.stl,
          blk: bucket.blk,
        },
      }]
    })
  )
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.BALLDONTLIE_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'BALLDONTLIE_API_KEY is not configured on the server.' })
  }

  const rawIds = String(req.query.playerIds || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)

  const playerIds = [...new Set(rawIds)].slice(0, 30)
  if (!playerIds.length) {
    return res.status(400).json({ error: 'At least one valid player id is required.' })
  }

  const season = Number.isInteger(Number(req.query.season))
    ? Number(req.query.season)
    : currentNbaSeasonStartYear()

  try {
    const allRows = []
    let cursor = null
    let pageCount = 0

    do {
      const params = new URLSearchParams()
      params.set('per_page', '100')
      params.append('seasons[]', String(season))
      params.set('postseason', 'false')
      for (const playerId of playerIds) params.append('player_ids[]', String(playerId))
      if (cursor !== null) params.set('cursor', String(cursor))

      const response = await fetch(`${BDL_STATS_URL}?${params.toString()}`, {
        headers: {
          Authorization: apiKey,
          Accept: 'application/json',
        },
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const upstreamMessage = payload?.message || payload?.error || 'BALLDONTLIE stats request failed.'
        return res.status(response.status).json({
          error: upstreamMessage,
          upstreamStatus: response.status,
        })
      }

      if (Array.isArray(payload?.data)) allRows.push(...payload.data)
      cursor = payload?.meta?.next_cursor ?? null
      pageCount += 1
    } while (cursor !== null && pageCount < 25)

    const stats = aggregateRows(allRows, playerIds)

    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
    return res.status(200).json({
      season,
      seasonLabel: `${season}-${String(season + 1).slice(-2)}`,
      postseason: false,
      stats,
      rowsProcessed: allRows.length,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('NBACAB stats proxy error:', error)
    return res.status(500).json({ error: 'Unable to load player stats right now.' })
  }
}
