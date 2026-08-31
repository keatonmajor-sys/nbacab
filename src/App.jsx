import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { teams } from './data/teams.js'

const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C']

function AppShell({ children }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link to="/" className="brand" aria-label="NBACAB home">
          <span className="brand-mark">NC</span>
          <span>
            <strong>NBACAB</strong>
            <small>NBA Coffee & Burritos</small>
          </span>
        </Link>
        <div className="header-tag">Roster playground</div>
      </header>
      <main>{children}</main>
    </div>
  )
}

function TeamBadge({ team }) {
  return <div className="team-badge" aria-hidden="true">{team.abbr}</div>
}

function TeamCard({ team }) {
  return (
    <Link to={`/team/${team.abbr.toLowerCase()}`} className="team-card">
      <TeamBadge team={team} />
      <div className="team-card-copy">
        <span>{team.city}</span>
        <strong>{team.name}</strong>
      </div>
      <span className="team-arrow">→</span>
    </Link>
  )
}

function TeamSection({ title, teamsForConference }) {
  return (
    <section className="conference-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Conference</span>
          <h2>{title}</h2>
        </div>
        <span className="team-count">15 teams</span>
      </div>
      <div className="team-grid">
        {teamsForConference.map((team) => <TeamCard key={team.abbr} team={team} />)}
      </div>
    </section>
  )
}

function HomePage() {
  const east = teams.filter((team) => team.conference === 'East')
  const west = teams.filter((team) => team.conference === 'West')

  return (
    <AppShell>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">All 30 teams. One clean view.</span>
          <h1>The NBA, without the spreadsheet energy.</h1>
          <p>Browse every roster, move starters around, compare stats and salaries, and eventually go as deep into the CBA as you want.</p>
        </div>
        <div className="hero-pill-row" aria-label="NBACAB feature preview">
          <span>30 teams</span><span>Live rosters</span><span>Stats</span><span>Salaries</span><span>CBA engine</span>
        </div>
      </section>
      <TeamSection title="Eastern Conference" teamsForConference={east} />
      <TeamSection title="Western Conference" teamsForConference={west} />
    </AppShell>
  )
}

function normalizedPositions(position = '') {
  const value = position.toUpperCase().replace(/\s/g, '')
  if (!value) return ['SF']
  if (value === 'G') return ['PG', 'SG']
  if (value === 'F') return ['SF', 'PF']
  if (value === 'C') return ['C']

  const tokens = value.split(/[-/]/).filter(Boolean)
  const slots = []
  for (const token of tokens) {
    if (token === 'PG') slots.push('PG')
    else if (token === 'SG') slots.push('SG')
    else if (token === 'SF') slots.push('SF')
    else if (token === 'PF') slots.push('PF')
    else if (token === 'C') slots.push('C')
    else if (token === 'G') slots.push('PG', 'SG')
    else if (token === 'F') slots.push('SF', 'PF')
  }
  return [...new Set(slots.length ? slots : ['SF'])]
}

function assignDepthChart(players) {
  const buckets = Object.fromEntries(POSITION_ORDER.map((position) => [position, []]))

  const sorted = [...players].sort((a, b) => {
    const aDraft = a.draft_number ?? 99
    const bDraft = b.draft_number ?? 99
    return aDraft - bDraft || a.last_name.localeCompare(b.last_name)
  })

  for (const player of sorted) {
    const options = normalizedPositions(player.position)
    const target = options.reduce((best, option) => (
      buckets[option].length < buckets[best].length ? option : best
    ), options[0])
    buckets[target].push(player)
  }

  return buckets
}

function PlayerCard({ player, starter }) {
  const fullName = `${player.first_name} ${player.last_name}`
  return (
    <article className={`player-card ${starter ? 'starter-card' : ''}`}>
      <div className="player-avatar" aria-hidden="true">
        <span>{player.first_name?.[0]}{player.last_name?.[0]}</span>
      </div>
      <div className="player-card-copy">
        <div className="player-topline">
          <strong>{fullName}</strong>
          {player.jersey_number ? <span className="jersey">#{player.jersey_number}</span> : null}
        </div>
        <div className="player-meta">
          <span>{player.position || '—'}</span>
          {player.height ? <span>{player.height}</span> : null}
          {player.weight ? <span>{player.weight} lb</span> : null}
        </div>
        <div className="player-detail-row">
          <span>{starter ? 'Starter slot' : 'Bench'}</span>
          {player.country ? <span>{player.country}</span> : null}
        </div>
      </div>
    </article>
  )
}

function PositionColumn({ label, players }) {
  return (
    <div className="position-column">
      <div className="position-label">
        <strong>{label}</strong>
        <span>{players.length}</span>
      </div>
      <div className="position-stack">
        {players.length ? players.map((player, index) => (
          <PlayerCard key={player.id} player={player} starter={index === 0} />
        )) : (
          <div className="empty-position">No player assigned</div>
        )}
      </div>
    </div>
  )
}

function LoadingRoster() {
  return (
    <div className="roster-state" aria-live="polite">
      <div className="loading-dot" />
      <div>
        <strong>Loading live roster…</strong>
        <span>Pulling active players from BALLDONTLIE.</span>
      </div>
    </div>
  )
}

function TeamPage() {
  const { teamAbbr } = useParams()
  const team = teams.find((item) => item.abbr.toLowerCase() === teamAbbr?.toLowerCase())
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!team) return
    const controller = new AbortController()

    async function loadRoster() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/roster?teamId=${team.id}`, { signal: controller.signal })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'Unable to load roster.')
        setPlayers(Array.isArray(payload?.data) ? payload.data : [])
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || 'Unable to load roster.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadRoster()
    return () => controller.abort()
  }, [team?.id])

  const depthChart = useMemo(() => assignDepthChart(players), [players])
  if (!team) return <Navigate to="/" replace />

  return (
    <AppShell>
      <Link to="/" className="back-link">← All teams</Link>

      <section className="team-hero">
        <TeamBadge team={team} />
        <div>
          <span className="eyebrow">{team.conference}ern Conference</span>
          <h1>{team.city} {team.name}</h1>
          <p>Current active roster from BALLDONTLIE, organized into an NBACAB depth-chart view.</p>
        </div>
      </section>

      <section className="status-strip">
        <div><span>Roster</span><strong>{loading ? 'Loading…' : `${players.length} active`}</strong></div>
        <div><span>Data</span><strong>BALLDONTLIE</strong></div>
        <div><span>Stats</span><strong>Next build</strong></div>
        <div><span>Salaries</span><strong>Data source next</strong></div>
      </section>

      <section className="depth-chart-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Live roster</span>
            <h2>Depth chart</h2>
          </div>
          <span className="team-count">Position layout is provisional</span>
        </div>

        {loading ? <LoadingRoster /> : null}
        {error ? (
          <div className="error-state" role="alert">
            <strong>Roster couldn't load.</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            <div className="depth-chart-grid live-grid">
              {POSITION_ORDER.map((position) => (
                <PositionColumn key={position} label={position} players={depthChart[position]} />
              ))}
            </div>
            <p className="roster-footnote">
              BALLDONTLIE supplies listed positions such as G, F and C. NBACAB is temporarily distributing combo positions across PG/SG/SF/PF/C until we add our editable depth-chart layer.
            </p>
          </>
        ) : null}
      </section>
    </AppShell>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/team/:teamAbbr" element={<TeamPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
