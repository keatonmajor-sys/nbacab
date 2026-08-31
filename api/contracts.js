const BDL_BASE = 'https://api.balldontlie.io/v1/contracts'

function currentContractSeasonStartYear(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  // NBA contract/cap seasons roll to the new league year in July.
  return month >= 6 ? year : year - 1
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const apiKey = process.env.BALLDONTLIE_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'BALLDONTLIE_API_KEY is not configured on the server.' })

  const playerId = Number(req.query.playerId)
  const teamId = Number(req.query.teamId)
  const season = Number.isInteger(Number(req.query.season)) ? Number(req.query.season) : currentContractSeasonStartYear()

  try {
    if (Number.isInteger(playerId) && playerId > 0) {
      const [yearsPayload, aggregatePayload] = await Promise.all([
        bdlGet(`${BDL_BASE}/players?player_id=${playerId}&per_page=100`, apiKey),
        bdlGet(`${BDL_BASE}/players/aggregate?player_id=${playerId}`, apiKey),
      ])
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
      return res.status(200).json({
        playerId,
        years: Array.isArray(yearsPayload?.data) ? yearsPayload.data : [],
        aggregates: Array.isArray(aggregatePayload?.data) ? aggregatePayload.data : [],
      })
    }

    if (!Number.isInteger(teamId) || teamId <= 0) return res.status(400).json({ error: 'A valid teamId or playerId is required.' })
    const payload = await bdlGet(`${BDL_BASE}/teams?team_id=${teamId}&season=${season}`, apiKey)
    const contracts = Array.isArray(payload?.data) ? payload.data : []
    const byPlayer = Object.fromEntries(contracts.map((contract) => [contract.player_id, contract]))
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
    return res.status(200).json({ season, seasonLabel: `${season}-${String(season + 1).slice(-2)}`, contracts, byPlayer })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'Unable to load contracts.' })
  }
}
