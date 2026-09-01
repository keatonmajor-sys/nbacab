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

function normalizePlayerName(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function money(value, compact = false) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  if (compact) {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(amount >= 10000000 ? 1 : 2).replace(/\.0$/, '')}M`
    if (amount >= 1000) return `$${Math.round(amount / 1000)}K`
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
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
        <h2>{title}</h2>
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
          <h1>See the league. Move some pieces.</h1>
          <p>Rosters, depth charts, stats, contracts and cap space. All in one place.</p>
        </div>
        <div className="hero-court" aria-hidden="true">
          <span className="court-center" />
          <span className="court-lane" />
          <span className="court-arc" />
          <span className="court-rim" />
        </div>
      </section>
      <div className="conference-layout">
        <TeamSection title="Eastern Conference" teamsForConference={east} />
        <TeamSection title="Western Conference" teamsForConference={west} />
      </div>
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

function projectionNameParts(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z.\- ']/g, '').trim().split(/\s+/).filter(Boolean)
}

function matchProjectedPlayer(name, players, usedIds = new Set()) {
  if (!name) return null
  const wanted = normalizePlayerName(name)
  let exact = players.find((player) => !usedIds.has(player.id) && normalizePlayerName(fullName(player)) === wanted)
  if (exact) return exact

  const parts = projectionNameParts(name)
  const last = normalizePlayerName(parts.at(-1) || '')
  const firstInitial = normalizePlayerName(parts[0] || '')[0]
  const candidates = players.filter((player) => {
    if (usedIds.has(player.id)) return false
    const playerLast = normalizePlayerName(player.last_name || '')
    if (!last || playerLast !== last) return false
    return !firstInitial || normalizePlayerName(player.first_name || '')[0] === firstInitial
  })
  return candidates.length === 1 ? candidates[0] : null
}

function buildExpectedDepthChart(players, teamAbbr, projection = null) {
  const fallback = assignDepthChart(players)
  const projectionChart = projection?.chart

  if (projectionChart && POSITION_ORDER.some((position) => Array.isArray(projectionChart[position]) && projectionChart[position].length)) {
    const chart = Object.fromEntries(POSITION_ORDER.map((position) => [position, []]))
    const used = new Set()
    for (const position of POSITION_ORDER) {
      for (const projectedName of projectionChart[position] || []) {
        const player = matchProjectedPlayer(projectedName, players, used)
        if (!player) continue
        chart[position].push(player)
        used.add(player.id)
      }
    }
    // Any roster player not present in the external projection is retained using
    // NBACAB's provisional position assignment so the depth chart never loses a player.
    for (const position of POSITION_ORDER) {
      for (const player of fallback[position]) {
        if (!used.has(player.id)) {
          chart[position].push(player)
          used.add(player.id)
        }
      }
    }
    return chart
  }

  const expected = EXPECTED_STARTERS[teamAbbr]
  if (!expected) return fallback
  const buckets = fallback
  const playerByName = new Map(players.map((player) => [fullName(player).toLowerCase(), player]))
  const forcedIds = new Set()
  for (const position of POSITION_ORDER) {
    const starterName = expected[position]
    const player = starterName ? playerByName.get(starterName.toLowerCase()) : null
    if (player) forcedIds.add(player.id)
  }
  for (const position of POSITION_ORDER) buckets[position] = buckets[position].filter((player) => !forcedIds.has(player.id))
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

function PlayerCard({ player, starter, stats, statsLoading, contract, onOpen, editMode, onDragStart, onDragEnd, onMove, onDropOnCard, position, depthIndex, mobileStatKey }) {
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
          {contract ? <div className="card-salary">{money(contract.cap_hit ?? contract.base_salary, true)} {contract.cap_hit != null ? 'cap hit' : 'salary'}</div> : null}
          <div className="desktop-card-stats">
            {statsLoading ? <div className="stats-loading-line" aria-label="Loading stats"><span /><span /><span /></div> : <CardStats stats={stats} compact={!starter} />}
          </div>
          <div className="mobile-quick-stats" aria-label="Mobile season averages">
            {[
              ['PTS', 'pts'], ['REB', 'reb'], ['AST', 'ast'],
              ['BLK', 'blk'], ['STL', 'stl'], ['3PM', 'fg3m'],
            ].map(([label, key]) => (
              <span key={key}><strong>{statsLoading ? '…' : mobileStatValue(stats, key)}</strong><small>{label}</small></span>
            ))}
          </div>
        </div>
      </button>
      {editMode ? <button type="button" className="move-player-button" onClick={() => onMove(player)} aria-label={`Move ${name}`}>Move</button> : null}
      {editMode ? <div className="card-drop-label">{starter ? 'Drop starter here' : `Take ${position}${depthIndex + 1} spot`}</div> : null}
    </article>
  )
}

function PositionColumn({ label, players, statsByPlayer, statsLoading, contractsByPlayer, onOpenPlayer, editMode, onDragStart, onDragEnd, onDropAt, onDropOnCard, onMovePlayer, mobileStatKey }) {
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
              contract={contractsByPlayer[player.id]}
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

function PlayerDetail({ player, stats, seasonLabel, contractSeason, contract, contractDetail, contractLoading, contractError, onClose }) {
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

        <div className="detail-contract-section">
          <div className="detail-section-heading contract-heading">
            <div><span className="eyebrow">Contract</span><h3>Money & years</h3></div>
            {contract ? <strong className="contract-cap-hit">{money(contract.cap_hit ?? contract.base_salary, true)} {contract.cap_hit != null ? 'cap hit' : 'salary'}</strong> : null}
          </div>
          {contractLoading ? <div className="detail-empty">Loading contract details…</div> : contractError ? <div className="detail-empty">{contractError}</div> : contractDetail ? (
            <>
              {contractDetail.aggregates?.[0] ? (() => { const deal = contractDetail.aggregates[0]; return (
                <div className="contract-summary">
                  <Metric label="TOTAL VALUE" value={money(deal.total_value, true)} />
                  <Metric label="YEARS" value={deal.contract_years ?? '—'} />
                  <Metric label="GUARANTEED" value={money(deal.total_guaranteed, true)} />
                  <Metric label="AVG / YEAR" value={money(deal.average_salary, true)} />
                  <Metric label="FREE AGENT" value={deal.free_agent_year ? `${deal.free_agent_year} ${deal.free_agent_status || ''}`.trim() : '—'} />
                </div>
              )})() : null}
              {contractDetail.years?.length ? (() => {
                const sortedYears = contractDetail.years.slice().sort((a,b) => a.season-b.season)
                const currentYears = sortedYears.filter((year) => Number(year.season) >= Number(contractSeason || 0))
                const previousYears = sortedYears.filter((year) => Number(year.season) < Number(contractSeason || 0))
                return <>
                  <div className="contract-years">
                    {(currentYears.length ? currentYears : sortedYears.slice(-1)).map((year) => (
                      <div className="contract-year" key={year.id || year.season}><span>{year.season}-{String(year.season + 1).slice(-2)}</span><strong>{money(year.cap_hit ?? year.base_salary)}</strong></div>
                    ))}
                  </div>
                  {previousYears.length ? <details className="previous-contracts"><summary>Previous salary history</summary><div className="contract-years previous">
                    {previousYears.map((year) => <div className="contract-year" key={`old-${year.id || year.season}`}><span>{year.season}-{String(year.season + 1).slice(-2)}</span><strong>{money(year.cap_hit ?? year.base_salary)}</strong></div>)}
                  </div></details> : null}
                </>
              })() : <div className="detail-empty">No year-by-year contract rows returned.</div>}
              {contractDetail.aggregates?.[0]?.contract_notes?.length ? <div className="contract-notes">{contractDetail.aggregates[0].contract_notes.map((note) => <span key={note}>{note}</span>)}</div> : null}
              <div className="contract-source-line">Source: {contractDetail.detailSource || contract?.source || 'BALLDONTLIE'}{contract?.source_type === 'fallback' ? ' fallback' : ''}</div>
            </>
          ) : <div className="detail-empty">No contract details loaded.</div>}
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
  const [rosterVerification, setRosterVerification] = useState(null)
  const [projectedLineup, setProjectedLineup] = useState(null)
  const [projectedLineupLoading, setProjectedLineupLoading] = useState(false)
  const [projectedLineupError, setProjectedLineupError] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statsByPlayer, setStatsByPlayer] = useState({})
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState('')
  const [seasonLabel, setSeasonLabel] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [contractsByPlayer, setContractsByPlayer] = useState({})
  const [contractsLoading, setContractsLoading] = useState(false)
  const [contractsError, setContractsError] = useState('')
  const [contractSeason, setContractSeason] = useState(2026)
  const [contractDetail, setContractDetail] = useState(null)
  const [contractDetailLoading, setContractDetailLoading] = useState(false)
  const [contractDetailError, setContractDetailError] = useState('')
  const [teamCapData, setTeamCapData] = useState(null)
  const [contractSources, setContractSources] = useState({})

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
        setRosterVerification(payload?.rosterVerification || null)
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
    if (!team || !players.length) return
    const controller = new AbortController()
    async function loadProjectedLineup() {
      setProjectedLineupLoading(true)
      setProjectedLineupError('')
      try {
        const params = new URLSearchParams({ teamAbbr: team.abbr })
        const response = await fetch(`/api/depth-chart?${params.toString()}`, { signal: controller.signal })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'Unable to load projected depth chart.')
        setProjectedLineup(payload)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setProjectedLineup(null)
          setProjectedLineupError(err.message || 'Unable to load projected depth chart.')
        }
      } finally {
        if (!controller.signal.aborted) setProjectedLineupLoading(false)
      }
    }
    loadProjectedLineup()
    return () => controller.abort()
  }, [team?.abbr, players.length])

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

  useEffect(() => {
    if (!team || !players.length) return
    const controller = new AbortController()
    async function loadContracts() {
      setContractsLoading(true); setContractsError('')
      try {
        const params = new URLSearchParams({ teamId: String(team.id), teamAbbr: team.abbr, season: '2026' })
        const response = await fetch(`/api/contracts?${params.toString()}`, { signal: controller.signal })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'Unable to load contracts.')
        const primary = payload?.byPlayer || {}
        const spotrac = payload?.spotracByName || {}
        const bref = payload?.brefByName || {}
        const merged = {}
        players.forEach((player) => {
          const direct = primary[player.id]
          if (direct && (direct.cap_hit != null || direct.base_salary != null)) {
            merged[player.id] = direct
            return
          }
          const key = normalizePlayerName(fullName(player))
          const spotracFallback = spotrac[key]
          if (spotracFallback && (spotracFallback.cap_hit != null || spotracFallback.base_salary != null)) {
            merged[player.id] = spotracFallback
            return
          }
          const brefFallback = bref[key]
          if (brefFallback?.base_salary != null) merged[player.id] = brefFallback
        })
        setContractsByPlayer(merged)
        setTeamCapData(payload?.teamCap || null)
        setContractSources(payload?.sources || {})
        setContractSeason(Number(payload?.season || 2026))
      } catch (err) { if (err.name !== 'AbortError') setContractsError(err.message || 'Unable to load contracts.') }
      finally { if (!controller.signal.aborted) setContractsLoading(false) }
    }
    loadContracts(); return () => controller.abort()
  }, [team?.id, team?.abbr, players])

  useEffect(() => {
    if (!selectedPlayer) { setContractDetail(null); setContractDetailError(''); return }
    const controller = new AbortController()
    async function loadContractDetail() {
      setContractDetailLoading(true); setContractDetailError(''); setContractDetail(null)
      try {
        const selectedContract = contractsByPlayer[selectedPlayer.id]
        const params = new URLSearchParams({ playerId: String(selectedPlayer.id), season: String(contractSeason || 2026) })
        if (selectedContract?.spotrac_path) params.set('spotracPath', selectedContract.spotrac_path)
        const response = await fetch(`/api/contracts?${params.toString()}`, { signal: controller.signal })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'Unable to load contract details.')
        setContractDetail(payload)
      } catch (err) { if (err.name !== 'AbortError') setContractDetailError(err.message || 'Unable to load contract details.') }
      finally { if (!controller.signal.aborted) setContractDetailLoading(false) }
    }
    loadContractDetail(); return () => controller.abort()
  }, [selectedPlayer?.id, contractsByPlayer, contractSeason])

  const expectedDepthChart = useMemo(() => buildExpectedDepthChart(players, team?.abbr, projectedLineup), [players, team?.abbr, projectedLineup])
  const [depthChart, setDepthChart] = useState(() => Object.fromEntries(POSITION_ORDER.map((position) => [position, []])))
  const editMode = true
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

  const CAP_2026 = { cap: 164961000, tax: 200428000, firstApron: 209015000, secondApron: 221686000 }
  const matchedContractCount = players.filter((player) => contractsByPlayer[player.id]).length
  const exactCapMatchCount = players.filter((player) => contractsByPlayer[player.id]?.cap_hit != null).length
  const fallbackCount = players.filter((player) => contractsByPlayer[player.id]?.source_type === 'fallback').length
  const knownRosterCap = players.reduce((sum, player) => {
    const row = contractsByPlayer[player.id]
    return sum + Number(row?.cap_hit ?? 0)
  }, 0)
  const spotracTotalCap = Number(teamCapData?.totalCap)
  const capBasis = Number.isFinite(spotracTotalCap) && spotracTotalCap > 0 ? spotracTotalCap : knownRosterCap
  const capBasisLabel = Number.isFinite(spotracTotalCap) && spotracTotalCap > 0 ? 'Spotrac total allocations' : 'Matched roster cap hits'
  const activeRosterBasis = Number.isFinite(Number(teamCapData?.activeRoster)) && Number(teamCapData?.activeRoster) > 0 ? Number(teamCapData.activeRoster) : knownRosterCap
  const capRoom = CAP_2026.cap - capBasis
  const taxRoom = CAP_2026.tax - activeRosterBasis
  const firstApronRoom = Number.isFinite(Number(teamCapData?.firstApronSpace)) && Number(teamCapData?.firstApronSpace) >= 0 ? Number(teamCapData.firstApronSpace) : CAP_2026.firstApron - activeRosterBasis
  const secondApronRoom = Number.isFinite(Number(teamCapData?.secondApronSpace)) && Number(teamCapData?.secondApronSpace) >= 0 ? Number(teamCapData.secondApronSpace) : CAP_2026.secondApron - activeRosterBasis
  const roomLabel = (value) => `${money(Math.abs(value), true)} ${value >= 0 ? 'under' : 'over'}`

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
        <div><span>Roster</span><strong>{loading ? 'Loading…' : `${players.length} active${rosterVerification?.status === 'reconciled' ? ' · verified' : ''}`}</strong></div>
        <div><span>Photos</span><strong>{loading ? 'Matching…' : `${imageMatches}/${players.length} matched`}</strong></div>
        <div><span>Stats</span><strong>{statsLoading ? 'Calculating…' : statsError ? 'Unavailable' : seasonLabel ? `${seasonLabel} latest` : 'Waiting…'}</strong></div>
        <div><span>Contracts</span><strong>{contractsLoading ? 'Loading…' : contractsError ? 'Unavailable' : `${matchedContractCount}/${players.length} matched · ${fallbackCount ? `${fallbackCount} fallback · ` : ''}${contractSeason}-${String(contractSeason + 1).slice(-2)}`}</strong></div>
      </section>

      {rosterVerification ? (
        <div className={`roster-verification ${rosterVerification.status === 'reconciled' ? 'verified' : 'limited'}`} role="status">
          <div>
            <strong>{rosterVerification.status === 'reconciled' ? 'Roster reconciled' : 'Roster primary feed'}</strong>
            <span>BDL + ESPN{rosterVerification.sources?.nbaOffseasonTracker ? ' + NBA transactions' : ''}{rosterVerification.sources?.verifiedOverrides ? ' + verified overrides' : ''}</span>
          </div>
          <small>{rosterVerification.additionsApplied?.length || rosterVerification.departuresApplied?.length ? `${(rosterVerification.additionsApplied?.length || 0) + (rosterVerification.departuresApplied?.length || 0)} stale roster ${((rosterVerification.additionsApplied?.length || 0) + (rosterVerification.departuresApplied?.length || 0)) === 1 ? 'item' : 'items'} corrected` : 'No confirmed transaction corrections needed'}</small>
        </div>
      ) : null}

      <section className="cap-overview">
        <div className="cap-overview-heading">
          <div><span className="eyebrow">2026-27 CBA</span><h2>Cap overview</h2></div>
          <div className="cap-known"><span>{capBasisLabel}</span><strong>{contractsLoading ? 'Loading…' : money(capBasis, true)}</strong><small>{exactCapMatchCount}/{players.length} exact cap hits · {fallbackCount} fallback</small></div>
        </div>
        <div className="cap-threshold-grid">
          <div><span>Salary cap</span><strong>{money(CAP_2026.cap, true)}</strong><small>{roomLabel(capRoom)}</small></div>
          <div><span>Luxury tax</span><strong>{money(CAP_2026.tax, true)}</strong><small>{roomLabel(taxRoom)}</small></div>
          <div><span>1st apron</span><strong>{money(CAP_2026.firstApron, true)}</strong><small>{roomLabel(firstApronRoom)}</small></div>
          <div><span>2nd apron</span><strong>{money(CAP_2026.secondApron, true)}</strong><small>{roomLabel(secondApronRoom)}</small></div>
        </div>
        <p className="cap-disclaimer">NBA 2026-27 thresholds are official. Contract priority is BALLDONTLIE → Spotrac fallback → Basketball Reference salary fallback. When Spotrac team totals are available, NBACAB uses them for the cap overview; otherwise it falls back to exact matched player cap hits. Basketball Reference salary-only rows are never treated as exact cap hits.</p>
      </section>

      <section className="depth-chart-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{customLineup ? 'Your lineup' : 'Expected lineup'}</span>
            <h2>Depth chart</h2>
          </div>
          <div className="depth-chart-actions">
            <button type="button" className="secondary-action" onClick={resetExpectedLineup}>Reset expected</button>
          </div>
        </div>
        <div className="lineup-context-row">
          <p className="lineup-context">
            {customLineup
              ? 'This is your saved arrangement on this device. Move any player to any position.'
              : projectedLineup
                ? `${projectedLineup.provider} projected depth chart · ${projectedLineup.seasonLabel}. Rotation order is mapped onto NBACAB's reconciled roster.`
                : projectedLineupLoading
                  ? 'Loading projected starters and rotation…'
                  : projectedLineupError
                    ? 'Projected lineup feed is unavailable, so NBACAB is using its provisional depth chart.'
                    : 'NBACAB is using its provisional depth chart.'}
          </p>
          {!customLineup && projectedLineup ? (
            <span className={`lineup-confidence ${projectedLineup.validation?.confidence || 'medium'}`}>
              {projectedLineup.validation?.confidence === 'high' ? 'High confidence' : projectedLineup.validation?.confidence === 'low' ? 'Low confidence' : 'Projected'}
              {projectedLineup.validation?.checked ? ` · ${projectedLineup.validation.agreements}/${projectedLineup.validation.checked} source agreement` : ''}
            </span>
          ) : null}
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
                  contractsByPlayer={contractsByPlayer}
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
        contractSeason={contractSeason}
        contract={selectedPlayer ? contractsByPlayer[selectedPlayer.id] : null}
        contractDetail={contractDetail}
        contractLoading={contractDetailLoading}
        contractError={contractDetailError}
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
