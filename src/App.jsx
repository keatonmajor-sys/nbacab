import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { teams } from './data/teams.js'

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
  return (
    <div className="team-badge" aria-hidden="true">
      {team.abbr}
    </div>
  )
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
        {teamsForConference.map((team) => (
          <TeamCard key={team.abbr} team={team} />
        ))}
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
          <p>
            Browse every roster, move starters around, compare stats and salaries,
            and eventually go as deep into the CBA as you want.
          </p>
        </div>

        <div className="hero-pill-row" aria-label="NBACAB feature preview">
          <span>30 teams</span>
          <span>Live rosters</span>
          <span>Stats</span>
          <span>Salaries</span>
          <span>CBA engine</span>
        </div>
      </section>

      <TeamSection title="Eastern Conference" teamsForConference={east} />
      <TeamSection title="Western Conference" teamsForConference={west} />
    </AppShell>
  )
}

function PositionColumn({ label }) {
  return (
    <div className="position-column">
      <div className="position-label">{label}</div>
      <div className="player-placeholder starter-placeholder">
        <div className="player-silhouette">+</div>
        <strong>Starter</strong>
        <span>Live roster coming next</span>
      </div>
      <div className="player-placeholder">
        <div className="player-silhouette small">+</div>
        <strong>Bench</strong>
        <span>Drag & reorder soon</span>
      </div>
    </div>
  )
}

function TeamPage() {
  const { teamAbbr } = useParams()
  const team = teams.find((item) => item.abbr.toLowerCase() === teamAbbr?.toLowerCase())

  if (!team) return <Navigate to="/" replace />

  return (
    <AppShell>
      <Link to="/" className="back-link">← All teams</Link>

      <section className="team-hero">
        <TeamBadge team={team} />
        <div>
          <span className="eyebrow">{team.conference}ern Conference</span>
          <h1>{team.city} {team.name}</h1>
          <p>Depth chart, stats, salaries and contract intelligence will live here.</p>
        </div>
      </section>

      <section className="status-strip">
        <div>
          <span>Roster</span>
          <strong>Next step</strong>
        </div>
        <div>
          <span>Stats</span>
          <strong>BALLDONTLIE</strong>
        </div>
        <div>
          <span>Salaries</span>
          <strong>Coming next</strong>
        </div>
        <div>
          <span>CBA</span>
          <strong>Engine later</strong>
        </div>
      </section>

      <section className="depth-chart-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Visual roster</span>
            <h2>Depth chart</h2>
          </div>
          <button type="button" className="ghost-button" disabled>
            Edit lineup soon
          </button>
        </div>

        <div className="depth-chart-grid">
          {['PG', 'SG', 'SF', 'PF', 'C'].map((position) => (
            <PositionColumn key={position} label={position} />
          ))}
        </div>
      </section>

      <section className="build-note">
        <span className="eyebrow">Build status</span>
        <h2>The shell is working.</h2>
        <p>
          The next build connects this team page to BALLDONTLIE so these placeholders
          become real active players.
        </p>
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
