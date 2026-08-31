import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { teams } from './data/teams.js'

const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C']
const MOBILE_STAT_OPTIONS = [
  ['PTS', 'pts'], ['REB', 'reb'], ['AST', 'ast'], ['FG%', 'fgPct'], ['3P%', 'fg3Pct'],
  ['FT%', 'ftPct'], ['3PM', 'fg3m'], ['STL', 'stl'], ['BLK', 'blk'], ['TOV', 'turnover'],
]

const EXPECTED_STARTERS = {
  POR: { PG: 'Ja Morant', SG: 'Damian Lillard', SF: 'Deni Avdija', PF: 'Toumani Camara', C: 'Donovan Clingan' },
}

function fullName(player) {
  return `${player.first_name} ${player.last_name}`.trim()
}

function storageKey(teamAbbr) {
  return `nbacab-depth-chart-v1:${teamAbbr}`
}

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

function buildExpectedDepthChart(players, teamAbbr) {
  const buckets = assignDepthChart(players)
  const expected = EXPECTED_STARTERS[teamAbbr]
  if (!expected) return buckets

  const playerByName = new Map(players.map((player) => [fullName(player).toLowerCase(), player]))
  const forcedIds = new Set()

  for (const position of POSITION_ORDER) {
    const starterName = expected[position]
    const player = starterName ? playerByName.get(starterName.toLowerCase()) : null
    if (player) forcedIds.add(player.id)
  }

  for (const position of POSITION_ORDER) {
    buckets[position] = buckets[position].filter((player) => !forcedIds.has(player.id))
  }

  for (const position of POSITION_ORDER) {
    const starterName = expected[position]
    const player = starterName ? playerByName.get(starterName.toLowerCase()) : null
    if (player) buckets[position] = [player, ...buckets[position]]
  }

  return buckets
}

function serializeDepthChart(chart) {
  return Object.fromEntries(POSITION_ORDER.map((position) => [position, chart[position].map((player) => player.id)]))
}

function hydrateDepthChart(saved, players, fallback) {
  if (!saved || typeof saved !== 'object') return fallback
  const byId = new Map(players.map((player) => [String(player.id), player]))
  const seen = new Set()
  const chart = Object.fromEntries(POSITION_ORDER.map((position) => [position, []]))

  for (const position of POSITION_ORDER) {
    const ids = Array.isArray(saved[position]) ? saved[position] : []
    for (const id of ids) {
      const player = byId.get(String(id))
      if (player && !seen.has(player.id)) {
        chart[position].push(player)
        seen.add(player.id)
      }
    }
  }

  for (const position of POSITION_ORDER) {
    for (const player of fallback[position]) {
      if (!seen.has(player.id)) {
        chart[position].push(player)
        seen.add(player.id)
      }
    }
  }

  return chart
}

function locatePlayer(chart, playerId) {
  for (const position of POSITION_ORDER) {
    const index = chart[position].findIndex((player) => player.id === playerId)
    if (index !== -1) return { position, index, player: chart[position][index] }
  }
  return null
}

function movePlayer(chart, playerId, targetPosition, targetIndex = null) {
  const next = Object.fromEntries(POSITION_ORDER.map((position) => [position, [...chart[position]]]))
  const source = locatePlayer(next, playerId)
  if (!source || !next[targetPosition]) return chart

  next[source.position].splice(source.index, 1)
  let requestedIndex = targetIndex
  if (requestedIndex !== null && source.position === targetPosition && source.index < requestedIndex) requestedIndex -= 1
  const safeIndex = requestedIndex === null ? next[targetPosition].length : Math.max(0, Math.min(requestedIndex, next[targetPosition].length))
  next[targetPosition].splice(safeIndex, 0, source.player)
  return next
}

function dropPlayerOnCard(chart, playerId, targetPosition, targetIndex) {
  const source = locatePlayer(chart, playerId)
  if (!source || !chart[targetPosition]?.[targetIndex]) return movePlayer(chart, playerId, targetPosition, targetIndex)

  // Starter-on-starter is a true swap: each starter takes the other's position.
  if (source.index === 0 && targetIndex === 0 && source.position !== targetPosition) {
    const next = Object.fromEntries(POSITION_ORDER.map((position) => [position, [...chart[position]]]))
    const targetPlayer = next[targetPosition][0]
    next[targetPosition][0] = source.player
    next[source.position][0] = targetPlayer
    return next
  }

  // Every other card behaves like a depth slot: the dragged player takes this
  // exact spot and everyone at/under it moves down one. The source column compacts.
  return movePlayer(chart, playerId, targetPosition, targetIndex)
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

function CardStats({ stats, compact = false }) {
  if (!stats || !stats.gamesPlayed) {
    return <div className={`card-stats ${compact ? 'compact' : ''} unavailable`}><span>Stats unavailable</span></div>
  }

  const items = [
    ['PTS', stats.pts], ['REB', stats.reb], ['AST', stats.ast],
    ['FG%', `${stats.fgPct}%`], ['3P%', `${stats.fg3Pct}%`], ['FT%', `${stats.ftPct}%`],
    ['3PM', stats.fg3m ?? '—'], ['STL', stats.stl], ['BLK', stats.blk], ['TOV', stats.turnover],
  ]

  return (
    <div className={`card-stats ${compact ? 'compact' : ''}`} aria-label="Season averages">
      {items.map(([label, value]) => <span key={label}><strong>{value}</strong><small>{label}</small></span>)}
    </div>
  )
}

function mobileStatValue(stats, statKey) {
  if (!stats || !stats.gamesPlayed) return '—'
  const value = stats[statKey]
  if (value === undefined || value === null) return '—'
  return ['fgPct', 'fg3Pct', 'ftPct'].includes(statKey) ? `${value}%` : value
}

function EndDropZone({ position, index, editMode, onDropAt, empty = false }) {
  if (!editMode) return null
  return (
    <div
      className={`depth-end-drop ${empty ? 'empty-column-drop' : ''}`}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
      onDragEnter={(event) => event.currentTarget.classList.add('is-over')}
      onDragLeave={(event) => event.currentTarget.classList.remove('is-over')}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.classList.remove('is-over')
        onDropAt(event, position, index)
      }}
    >
      <span>{empty ? `Drop at ${position}` : `Add to ${position} depth`}</span>
    </div>
  )
}

function PlayerCard({ player, starter, stats, statsLoading, onOpen, editMode, onDragStart, onDragEnd, onMove, onDropOnCard, position, depthIndex, mobileStatKey }) {
  const name = fullName(player)
  const mobileLabel = MOBILE_STAT_OPTIONS.find(([, key]) => key === mobileStatKey)?.[0] || 'PTS'
  return (
    <article
      className={`player-card ${starter ? 'starter-card' : 'bench-card'} ${editMode ? 'is-editing' : ''}`}
      onDragOver={editMode ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; event.currentTarget.classList.add('card-drop-over') } : undefined}
      onDragLeave={editMode ? (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove('card-drop-over')
      } : undefined}
      onDrop={editMode ? (event) => {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.classList.remove('card-drop-over')
        onDropOnCard(event, position, depthIndex)
      } : undefined}
    >
      <div
        className={`player-photo-drag-zone ${editMode ? 'can-drag' : ''}`}
        draggable={editMode}
        onDragStart={(event) => editMode && onDragStart(event, player)}
        onDragEnd={onDragEnd}
        title={editMode ? `Drag ${name}` : undefined}
      >
        <PlayerImage player={player} starter={starter} />
        {editMode ? <span className="drag-photo-label">DRAG</span> : null}
      </div>
      <button type="button" className="player-info-button" onClick={() => onOpen(player)} aria-label={`Open ${name} details`}>
        <div className="player-card-copy">
          <div className="player-topline">
            <strong title={name}>{name}</strong>
            {player.jersey_number ? <span className="jersey">#{player.jersey_number}</span> : null}
          </div>
          <div className="player-meta">
            <span>{player.position || '—'}</span>
            {player.height ? <span>{player.height}</span> : null}
            {player.weight ? <span>{player.weight} lb</span> : null}
          </div>
          <div className="desktop-card-stats">
            {statsLoading ? <div className="stats-loading-line" aria-label="Loading stats"><span /><span /><span /></div> : <CardStats stats={stats} compact={!starter} />}
          </div>
          <div className="mobile-one-stat" aria-label={`${mobileLabel} ${mobileStatValue(stats, mobileStatKey)}`}>
            <strong>{statsLoading ? '…' : mobileStatValue(stats, mobileStatKey)}</strong><span>{mobileLabel}</span>
          </div>
        </div>
      </button>
      {editMode ? <button type="button" className="move-player-button" onClick={() => onMove(player)} aria-label={`Move ${name}`}>Move</button> : null}
      {editMode ? <div className="card-drop-label">{starter ? 'Drop starter here' : `Take ${position}${depthIndex + 1} spot`}</div> : null}
    </article>
  )
}

function PositionColumn({ label, players, statsByPlayer, statsLoading, onOpenPlayer, editMode, onDragStart, onDragEnd, onDropAt, onDropOnCard, onMovePlayer, mobileStatKey }) {
  return (
    <div className={`position-column ${editMode ? 'editable-column' : ''}`}>
      <div className="position-label"><strong>{label}</strong><span>{players.length}</span></div>
      <div className="position-stack">
        {players.map((player, index) => (
          <div className="depth-entry" key={player.id}>
            <PlayerCard
              player={player}
              starter={index === 0}
              stats={statsByPlayer[player.id]}
              statsLoading={statsLoading}
              onOpen={onOpenPlayer}
              editMode={editMode}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onMove={onMovePlayer}
              onDropOnCard={onDropOnCard}
              position={label}
              depthIndex={index}
              mobileStatKey={mobileStatKey}
            />
          </div>
        ))}
        <EndDropZone position={label} index={players.length} editMode={editMode} onDropAt={onDropAt} empty={!players.length} />
        {!players.length && !editMode ? <div className="empty-position">No player assigned</div> : null}
      </div>
    </div>
  )
}

function MovePlayerPanel({ player, onMove, onClose }) {
  if (!player) return null
  const name = fullName(player)
  return (
    <div className="move-panel-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="move-panel" role="dialog" aria-modal="true" aria-label={`Move ${name}`}>
        <button type="button" className="detail-close" onClick={onClose} aria-label="Close move controls">×</button>
        <span className="eyebrow">Depth chart</span>
        <h3>Move {name}</h3>
        <p>Listed position never limits placement in NBACAB.</p>
        <div className="move-option-grid">
          {POSITION_ORDER.map((position) => (
            <div key={position} className="move-option-group">
              <strong>{position}</strong>
              <button type="button" onClick={() => onMove(position, 0)}>Start</button>
              <button type="button" onClick={() => onMove(position, null)}>Bench</button>
            </div>
          ))}
        </div>
      </section>
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
              <Metric label="3PM" value={stats.fg3m ?? '—'} />
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

  const expectedDepthChart = useMemo(() => buildExpectedDepthChart(players, team?.abbr), [players, team?.abbr])
  const [depthChart, setDepthChart] = useState(() => Object.fromEntries(POSITION_ORDER.map((position) => [position, []])))
  const [editMode, setEditMode] = useState(false)
  const [customLineup, setCustomLineup] = useState(false)
  const [movePlayerTarget, setMovePlayerTarget] = useState(null)
  const [draggingPlayerId, setDraggingPlayerId] = useState(null)
  const [mobileStatKey, setMobileStatKey] = useState('pts')

  useEffect(() => {
    if (!team || !players.length) return
    let saved = null
    try {
      saved = JSON.parse(localStorage.getItem(storageKey(team.abbr)) || 'null')
    } catch {
      saved = null
    }
    if (saved) {
      setDepthChart(hydrateDepthChart(saved, players, expectedDepthChart))
      setCustomLineup(true)
    } else {
      setDepthChart(expectedDepthChart)
      setCustomLineup(false)
    }
  }, [team?.abbr, players, expectedDepthChart])

  function persistChart(next) {
    setDepthChart(next)
    setCustomLineup(true)
    if (team) localStorage.setItem(storageKey(team.abbr), JSON.stringify(serializeDepthChart(next)))
  }

  function handleDragStart(event, player) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(player.id))
    setDraggingPlayerId(player.id)

    const ghost = document.createElement('div')
    ghost.className = 'nbacab-drag-ghost'
    if (player.image_url) {
      const img = document.createElement('img')
      img.src = player.image_url
      img.alt = ''
      ghost.appendChild(img)
    }
    const copy = document.createElement('div')
    copy.innerHTML = `<strong>${fullName(player)}</strong><span>Move anywhere</span>`
    ghost.appendChild(copy)
    document.body.appendChild(ghost)
    event.dataTransfer.setDragImage(ghost, 72, 72)
    requestAnimationFrame(() => ghost.remove())
  }

  function handleDragEnd() {
    setDraggingPlayerId(null)
  }

  function handleDropAt(event, position, index) {
    const playerId = Number(event.dataTransfer.getData('text/plain'))
    if (!playerId) return
    persistChart(movePlayer(depthChart, playerId, position, index))
  }

  function handleDropOnCard(event, position, index) {
    const playerId = Number(event.dataTransfer.getData('text/plain'))
    if (!playerId) return
    persistChart(dropPlayerOnCard(depthChart, playerId, position, index))
  }

  function resetExpectedLineup() {
    if (!team) return
    localStorage.removeItem(storageKey(team.abbr))
    setDepthChart(expectedDepthChart)
    setCustomLineup(false)
  }

  function moveFromPanel(position, index) {
    if (!movePlayerTarget) return
    persistChart(movePlayer(depthChart, movePlayerTarget.id, position, index))
    setMovePlayerTarget(null)
  }

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
            <span className="eyebrow">{customLineup ? 'Your lineup' : 'Expected lineup'}</span>
            <h2>Depth chart</h2>
          </div>
          <div className="depth-chart-actions">
            {customLineup ? <button type="button" className="secondary-action" onClick={resetExpectedLineup}>Reset expected</button> : null}
            <button type="button" className={`edit-lineup-button ${editMode ? 'active' : ''}`} onClick={() => setEditMode((value) => !value)}>
              {editMode ? 'Done editing' : 'Edit lineup'}
            </button>
          </div>
        </div>
        <p className="lineup-context">
          {customLineup
            ? 'This is your saved arrangement on this device. Move any player to any position.'
            : team.abbr === 'POR'
              ? 'Expected starters: Ja Morant · Damian Lillard · Deni Avdija · Toumani Camara · Donovan Clingan.'
              : 'NBACAB is using a provisional expected lineup until our expected-starter data feed is added.'}
        </p>
        <div className="mobile-stat-picker">
          <label htmlFor="mobile-stat-select">Mobile card stat</label>
          <select id="mobile-stat-select" value={mobileStatKey} onChange={(event) => setMobileStatKey(event.target.value)}>
            {MOBILE_STAT_OPTIONS.map(([label, key]) => <option key={key} value={key}>{label}</option>)}
          </select>
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
            <div className={`depth-chart-grid live-grid ${draggingPlayerId ? 'drag-active' : ''}`}>
              {POSITION_ORDER.map((position) => (
                <PositionColumn
                  key={position}
                  label={position}
                  players={depthChart[position]}
                  statsByPlayer={statsByPlayer}
                  statsLoading={statsLoading}
                  onOpenPlayer={setSelectedPlayer}
                  editMode={editMode}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDropAt={handleDropAt}
                  onDropOnCard={handleDropOnCard}
                  onMovePlayer={setMovePlayerTarget}
                  mobileStatKey={mobileStatKey}
                />
              ))}
            </div>
            <p className="roster-footnote">
              Drag-and-drop placement is unrestricted: a guard can play SF, a center can play PG, or anything else you want. Changes save automatically on this device. Player detail cards still show BALLDONTLIE's listed position for reference only.
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
      <MovePlayerPanel
        player={movePlayerTarget}
        onMove={moveFromPanel}
        onClose={() => setMovePlayerTarget(null)}
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
