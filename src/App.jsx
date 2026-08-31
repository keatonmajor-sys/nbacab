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

function TeamLogo({ team, size = 'normal' }) {
  const [failed, setFailed] = useState(false)
  const url = `https://a.espncdn.com/i/teamlogos/nba/500/${team.abbr.toLowerCase()}.png`

  return (
    <div className={`team-logo ${size === 'large' ? 'team-logo-large' : ''}`}>
      {!failed ? (
        <img src={url} alt={`${team.city} ${team.name} logo`} onError={() => setFailed(true)} />
      ) : (
        <strong aria-label={`${team.city} ${team.name}`}>{team.abbr}</strong>
      )}
    </div>
  )
}

function TeamCard({ team }) {
  return (
    <Link to={`/team/${team.abbr.toLowerCase()}`} className="team-card">
      <TeamLogo team={team} />
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
          <span>30 teams</span><span>Live rosters</span><span>Player photos</span><span>Real stats</span><span>CBA engine</span>
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

function Initials({ player }) {
  return <span>{player.first_name?.[0]}{player.last_name?.[0]}</span>
}

function PlayerImage({ player, starter = false, detail = false }) {
  const [failed, setFailed] = useState(false)
  const fullName = `${player.first_name} ${player.last_name}`

  return (
    <div className={`player-image-wrap ${starter ? 'starter-image-wrap' : ''} ${detail ? 'detail-image-wrap' : ''}`}>
      {player.image_url && !failed ? (
        <img
          className="player-image"
          src={player.image_url}
          alt={fullName}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="player-image-fallback" aria-label={fullName}>
          <Initials player={player} />
        </div>
      )}
    </div>
  )
}

function StatTriplet({ stats, compact = false }) {
  if (!stats || !stats.gamesPlayed) {
    return <div className={`stat-triplet ${compact ? 'compact' : ''} unavailable`}><span>Stats unavailable</span></div>
  }

  return (
    <div className={`stat-triplet ${compact ? 'compact' : ''}`} aria-label="Season averages">
      <span><strong>{stats.pts}</strong><small>PTS</small></span>
      <span><strong>{stats.reb}</strong><small>REB</small></span>
      <span><strong>{stats.ast}</strong><small>AST</small></span>
    </div>
  )
}

function PlayerCard({ player, starter, stats, statsLoading, onOpen }) {
  const fullName = `${player.first_name} ${player.last_name}`
  return (
    <button
      type="button"
      className={`player-card ${starter ? 'starter-card' : 'bench-card'}`}
      onClick={() => onOpen(player)}
      aria-label={`Open ${fullName} details`}
    >
      <PlayerImage player={player} starter={starter} />
      <div className="player-card-copy">
        <div className="player-topline">
          <strong title={fullName}>{fullName}</strong>
          {player.jersey_number ? <span className="jersey">#{player.jersey_number}</span> : null}
        </div>
        <div className="player-meta">
          <span>{player.position || '—'}</span>
          {player.height ? <span>{player.height}</span> : null}
          {player.weight ? <span>{player.weight} lb</span> : null}
        </div>
        {statsLoading ? (
          <div className="stats-loading-line" aria-label="Loading stats"><span /><span /><span /></div>
        ) : (
          <StatTriplet stats={stats} compact={!starter} />
        )}
      </div>
    </button>
  )
}

function PositionColumn({ label, players, statsByPlayer, statsLoading, onOpenPlayer }) {
  return (
    <div className="position-column">
      <div className="position-label">
        <strong>{label}</strong>
        <span>{players.length}</span>
      </div>
      <div className="position-stack">
        {players.length ? players.map((player, index) => (
          <PlayerCard
            key={player.id}
            player={player}
            starter={index === 0}
            stats={statsByPlayer[player.id]}
            statsLoading={statsLoading}
            onOpen={onOpenPlayer}
          />
        )) : (
          <div className="empty-position">No player assigned</div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="detail-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function PlayerDetail({ player, stats, seasonLabel, onClose }) {
  useEffect(() => {
    if (!player) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [player, onClose])

  if (!player) return null
  const fullName = `${player.first_name} ${player.last_name}`
  const hasStats = stats && stats.gamesPlayed > 0

  return (
    <div className="player-detail-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="player-detail-panel" role="dialog" aria-modal="true" aria-label={`${fullName} details`}>
        <button type="button" className="detail-close" onClick={onClose} aria-label="Close player details">×</button>
        <div className="detail-hero">
          <PlayerImage player={player} detail />
          <div className="detail-hero-copy">
            <span className="eyebrow">Player profile</span>
            <h2>{fullName}</h2>
            <p>
              {player.position || 'Position —'}
              {player.jersey_number ? ` · #${player.jersey_number}` : ''}
              {player.height ? ` · ${player.height}` : ''}
              {player.weight ? ` · ${player.weight} lb` : ''}
            </p>
            <div className="detail-tags">
              {player.country ? <span>{player.country}</span> : null}
              {player.college ? <span>{player.college}</span> : null}
              {player.draft_year ? <span>Draft {player.draft_year}{player.draft_round ? ` · R${player.draft_round}` : ''}{player.draft_number ? ` · #${player.draft_number}` : ''}</span> : <span>Undrafted</span>}
            </div>
          </div>
        </div>

        <div className="detail-section-heading">
          <div>
            <span className="eyebrow">{seasonLabel || 'Season'} regular season</span>
            <h3>Per-game stats</h3>
          </div>
          {hasStats ? <span className="team-count">{stats.gamesPlayed} GP</span> : null}
        </div>

        {hasStats ? (
          <>
            <div className="detail-primary-stats">
              <Metric label="PTS" value={stats.pts} />
              <Metric label="REB" value={stats.reb} />
              <Metric label="AST" value={stats.ast} />
              <Metric label="STL" value={stats.stl} />
              <Metric label="BLK" value={stats.blk} />
              <Metric label="MIN" value={stats.min} />
            </div>
            <div className="detail-shooting-stats">
              <Metric label="FG%" value={`${stats.fgPct}%`} />
              <Metric label="3P%" value={`${stats.fg3Pct}%`} />
              <Metric label="FT%" value={`${stats.ftPct}%`} />
              <Metric label="TOV" value={stats.turnover} />
              <Metric label="+/-" value={stats.plusMinus > 0 ? `+${stats.plusMinus}` : stats.plusMinus} />
            </div>
          </>
        ) : (
          <div className="detail-empty">No regular-season game stats were returned for this player in {seasonLabel || 'the selected season'}.</div>
        )}

        <div className="detail-coming">
          <span>Next on this card</span>
          <strong>Salary · Contract years · CBA status</strong>
        </div>
      </section>
    </div>
  )
}

function LoadingRoster() {
  return (
    <div className="roster-state" aria-live="polite">
      <div className="loading-dot" />
      <div>
        <strong>Loading live roster…</strong>
        <span>Pulling players and matching headshots.</span>
      </div>
    </div>
  )
}

function TeamPage() {
  const { teamAbbr } = useParams()
  const team = teams.find((item) => item.abbr.toLowerCase() === teamAbbr?.toLowerCase())
  const [players, setPlayers] = useState([])
  const [imageMatches, setImageMatches] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statsByPlayer, setStatsByPlayer] = useState({})
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')
  const [seasonLabel, setSeasonLabel] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState(null)

  useEffect(() => {
    if (!team) return
    const controller = new AbortController()

    async function loadRoster() {
      setLoading(true)
      setError('')
      setPlayers([])
      setStatsByPlayer({})
      setStatsError('')
      setSeasonLabel('')
      try {
        const params = new URLSearchParams({ teamId: String(team.id), teamAbbr: team.abbr })
        const response = await fetch(`/api/roster?${params.toString()}`, { signal: controller.signal })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'Unable to load roster.')
        setPlayers(Array.isArray(payload?.data) ? payload.data : [])
        setImageMatches(Number(payload?.imageMatches || 0))
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || 'Unable to load roster.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadRoster()
    return () => controller.abort()
  }, [team?.id, team?.abbr])

  useEffect(() => {
    if (!players.length) return
    const controller = new AbortController()

    async function loadStats() {
      setStatsLoading(true)
      setStatsError('')
      try {
        const playerIds = players.map((player) => player.id).join(',')
        const response = await fetch(`/api/stats?playerIds=${encodeURIComponent(playerIds)}`, { signal: controller.signal })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'Unable to load stats.')
        setStatsByPlayer(payload?.stats || {})
        setSeasonLabel(payload?.seasonLabel || '')
      } catch (err) {
        if (err.name !== 'AbortError') setStatsError(err.message || 'Unable to load stats.')
      } finally {
        if (!controller.signal.aborted) setStatsLoading(false)
      }
    }

    loadStats()
    return () => controller.abort()
  }, [players])

  const depthChart = useMemo(() => assignDepthChart(players), [players])
  if (!team) return <Navigate to="/" replace />

  return (
    <AppShell>
      <Link to="/" className="back-link">← All teams</Link>

      <section className="team-hero">
        <TeamLogo team={team} size="large" />
        <div>
          <span className="eyebrow">{team.conference}ern Conference</span>
          <h1>{team.city} {team.name}</h1>
          <p>Live roster, player photos and real box-score averages — designed to be understood at a glance.</p>
        </div>
      </section>

      <section className="status-strip">
        <div><span>Roster</span><strong>{loading ? 'Loading…' : `${players.length} active`}</strong></div>
        <div><span>Photos</span><strong>{loading ? 'Matching…' : `${imageMatches}/${players.length} matched`}</strong></div>
        <div><span>Stats</span><strong>{statsLoading ? 'Calculating…' : statsError ? 'Unavailable' : seasonLabel ? `${seasonLabel} live` : 'Waiting…'}</strong></div>
        <div><span>Salaries</span><strong>Next layer</strong></div>
      </section>

      <section className="depth-chart-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Live roster</span>
            <h2>Depth chart</h2>
          </div>
          <span className="team-count">Tap any player</span>
        </div>

        {loading ? <LoadingRoster /> : null}
        {error ? (
          <div className="error-state" role="alert">
            <strong>Roster couldn't load.</strong>
            <span>{error}</span>
          </div>
        ) : null}
        {statsError ? (
          <div className="stats-warning" role="status">
            <strong>Roster is live; stats are temporarily unavailable.</strong>
            <span>{statsError}</span>
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            <div className="depth-chart-grid live-grid">
              {POSITION_ORDER.map((position) => (
                <PositionColumn
                  key={position}
                  label={position}
                  players={depthChart[position]}
                  statsByPlayer={statsByPlayer}
                  statsLoading={statsLoading}
                  onOpenPlayer={setSelectedPlayer}
                />
              ))}
            </div>
            <p className="roster-footnote">
              Stats are calculated from BALLDONTLIE regular-season game box scores because season-average endpoints require GOAT. Position placement is still provisional until the editable depth-chart layer is added.
            </p>
          </>
        ) : null}
      </section>

      <PlayerDetail
        player={selectedPlayer}
        stats={selectedPlayer ? statsByPlayer[selectedPlayer.id] : null}
        seasonLabel={seasonLabel}
        onClose={() => setSelectedPlayer(null)}
      />
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
