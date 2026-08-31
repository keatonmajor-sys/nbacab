const BDL_BASE_URL = 'https://api.balldontlie.io/v1'

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
  if (!Number.isInteger(teamId) || teamId < 1 || teamId > 30) {
    return res.status(400).json({ error: 'A valid NBA teamId from 1 to 30 is required.' })
  }

  try {
    const params = new URLSearchParams()
    params.append('team_ids[]', String(teamId))
    params.set('per_page', '100')

    const response = await fetch(`${BDL_BASE_URL}/players/active?${params.toString()}`, {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const upstreamMessage = payload?.message || payload?.error || 'BALLDONTLIE request failed.'
      return res.status(response.status).json({
        error: upstreamMessage,
        upstreamStatus: response.status,
      })
    }

    const players = Array.isArray(payload?.data) ? payload.data : []

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800')
    return res.status(200).json({
      data: players,
      meta: payload?.meta ?? null,
      teamId,
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('NBACAB roster proxy error:', error)
    return res.status(500).json({ error: 'Unable to load the roster right now.' })
  }
}
