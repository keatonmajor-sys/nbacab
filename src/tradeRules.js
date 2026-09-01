export const CBA_2026_27 = {
  season: 2026,
  salaryCap: 164_961_000,
  tax: 200_428_000,
  firstApron: 209_015_000,
  secondApron: 221_686_000,
  minimumTeamSalary: 148_465_000,
  // 2024-25 CBA 101 lists $7.752M, escalating annually with the cap.
  expandedTpeDelta: Math.round(7_752_000 * (164_961_000 / 140_588_000)),
  tpeAllowance: 250_000,
  maxRoster: 15,
  minStandardRoster: 14,
  minTradeRoster: 12,
  maxFuturePickYear: 2033,
}

export function apronLabel(value, cba = CBA_2026_27) {
  if (!Number.isFinite(value)) return 'Team salary unavailable'
  if (value > cba.secondApron) return 'Above 2nd apron'
  if (value > cba.firstApron) return 'Above 1st apron'
  if (value > cba.tax) return 'Above tax'
  if (value > cba.salaryCap) return 'Above cap'
  return 'Below cap'
}

function statusRank(status) {
  return status === 'fail' ? 3 : status === 'review' ? 2 : 1
}

function strongestStatus(items) {
  return items.reduce((status, item) => statusRank(item.status) > statusRank(status) ? item.status : status, 'pass')
}

function line(status, title, detail, code) {
  return { status, title, detail, code }
}

function salaryMatchForTeam({ preSalary, outgoing, incoming, outgoingCount, incomingCount, cba }) {
  const postSalary = Number.isFinite(preSalary) ? preSalary - outgoing + incoming : null
  if (!Number.isFinite(preSalary)) {
    return {
      status: 'review',
      method: 'Team salary unavailable',
      maxIncoming: null,
      postSalary,
      lines: [line('review', 'Team salary needs verification', 'NBACAB has player salaries, but not a trustworthy full team-salary ledger for this team.', 'team-salary-missing')],
    }
  }

  const capRoom = Math.max(0, cba.salaryCap - preSalary)
  const allowance = postSalary > cba.firstApron ? 0 : cba.tpeAllowance
  const lines = []

  if (preSalary < cba.salaryCap) {
    const maxIncoming = outgoing + capRoom + allowance
    const ok = incoming <= maxIncoming + 1
    lines.push(line(ok ? 'pass' : 'fail', 'Cap-room salary matching', ok
      ? `Incoming salary fits within outgoing salary plus available cap room${allowance ? ' and the $250K allowance' : ''}.`
      : `Incoming salary exceeds the team’s cap-room trade capacity by $${Math.round(incoming - maxIncoming).toLocaleString()}.`, 'cap-room'))
    return { status: ok ? 'pass' : 'fail', method: 'Cap room', maxIncoming, postSalary, lines }
  }

  // Above the second apron: no salary aggregation and no taking back more salary overall.
  if (preSalary > cba.secondApron || postSalary > cba.secondApron) {
    const aggregateIssue = outgoingCount > 1
    const moneyOk = incoming <= outgoing + 1
    if (aggregateIssue) {
      lines.push(line('review', 'Second-apron aggregation check', 'This proposal sends multiple player salaries from a second-apron team. Those salaries cannot be aggregated to match one larger incoming contract; exact player-to-player matching needs contract-level assignment.', 'second-apron-aggregation'))
    } else {
      lines.push(line('pass', 'No salary aggregation', 'Only one outgoing player salary is being used, so the second-apron aggregation restriction is not triggered.', 'second-apron-aggregation'))
    }
    lines.push(line(moneyOk ? 'pass' : 'fail', 'Second-apron salary matching', moneyOk
      ? 'The team is not taking back more salary than it sends out.'
      : `The team would take back $${Math.round(incoming - outgoing).toLocaleString()} more salary than it sends out.`, 'second-apron-money'))
    const status = strongestStatus(lines)
    return { status, method: 'Second-apron standard TPE', maxIncoming: outgoing, postSalary, lines }
  }

  // Above first apron but at/below second apron: aggregation can be used, but Expanded TPE would hard-cap at first apron.
  if (preSalary > cba.firstApron || postSalary > cba.firstApron) {
    const maxIncoming = outgoing + allowance
    const ok = incoming <= maxIncoming + 1
    lines.push(line(ok ? 'pass' : 'fail', 'First-apron salary matching', ok
      ? 'Incoming salary does not exceed outgoing salary under the standard/aggregated TPE path.'
      : `Incoming salary exceeds outgoing salary by $${Math.round(incoming - outgoing).toLocaleString()}, which is not available once the transaction leaves the team above the first apron.`, 'first-apron-money'))
    if (outgoingCount > 1) lines.push(line('pass', 'Aggregation stays below the second apron', 'Multiple outgoing salaries may be aggregated because the post-trade team salary does not exceed the second apron.', 'first-apron-aggregation'))
    return { status: strongestStatus(lines), method: outgoingCount > 1 ? 'Aggregated standard TPE' : 'Standard TPE', maxIncoming, postSalary, lines }
  }

  // Below first apron: Expanded TPE is available. Formula from CBA 101.
  const expanded = Math.max(
    Math.min((2 * outgoing) + allowance, outgoing + cba.expandedTpeDelta),
    (1.25 * outgoing) + allowance,
  )
  const standard = outgoing + allowance
  const maxIncoming = Math.max(expanded, standard)
  const ok = incoming <= maxIncoming + 1
  lines.push(line(ok ? 'pass' : 'fail', 'Expanded traded-player exception', ok
    ? 'Incoming salary fits within the expanded TPE amount while the team remains at or below the first apron.'
    : `Incoming salary is $${Math.round(incoming - maxIncoming).toLocaleString()} above the largest simultaneous TPE amount available from the selected outgoing salary.`, 'expanded-tpe'))
  return { status: ok ? 'pass' : 'fail', method: 'Expanded TPE', maxIncoming, postSalary, lines }
}

function rosterCheck({ rosterCount, outgoingCount, incomingCount }) {
  if (!Number.isFinite(rosterCount)) return line('review', 'Roster count needs verification', 'Current roster count was unavailable.', 'roster-count')
  const after = rosterCount - outgoingCount + incomingCount
  if (after > 15) return line('fail', 'Too many standard contracts', `The trade would leave ${after} players on the roster, above the 15-player standard-roster maximum.`, 'roster-max')
  if (after < 12) return line('fail', 'Roster drops below trade minimum', `The trade would leave only ${after} players. A team cannot leave itself below the in-transaction roster minimum.`, 'roster-min')
  if (after < 14) return line('review', 'Roster fill required', `The trade leaves ${after} players. The transaction can require follow-up signings/roster charges to reach the normal regular-season minimum.`, 'roster-fill')
  return line('pass', 'Roster count', `The trade leaves ${after} players on the standard roster.`, 'roster-count')
}

function pickCouldRemoveFirst(asset) {
  return asset.kind === 'pick' && asset.round === 1
}

function stepienCheck({ assets, currentYear = 2026 }) {
  const firsts = assets.filter(pickCouldRemoveFirst)
  if (!firsts.length) return [line('pass', 'Stepien Rule', 'No outgoing first-round pick is included.', 'stepien')]

  const removedYears = new Set(firsts.map((asset) => Number(asset.year)).filter(Number.isFinite))
  const lines = []
  const years = [...removedYears].sort((a, b) => a - b)
  const consecutive = years.some((year) => removedYears.has(year + 1))
  if (consecutive) {
    lines.push(line('fail', 'Stepien Rule', 'The proposal sends first-round rights that could leave the team without a first-round pick in consecutive future drafts.', 'stepien'))
  } else {
    lines.push(line('pass', 'Stepien Rule', 'The outgoing first-round years in this proposal are not consecutive.', 'stepien'))
  }

  if (firsts.some((asset) => asset.ownershipVerified === false)) {
    lines.push(line('review', 'Existing pick obligations', 'At least one pick was added without verified ownership. Existing protected obligations can make additional future firsts untradeable even when the selected years are not consecutive.', 'pick-ownership'))
  }

  if (firsts.some((asset) => Number(asset.year) <= currentYear)) {
    lines.push(line('fail', 'Future-pick year', 'Only future draft rights can be traded in this trade builder.', 'pick-year'))
  }

  return lines
}

function protectionCheck(assets) {
  const banned = new Set(['Top 12', 'Top 13', 'Top 14', 'Top 15'])
  return assets.filter((asset) => asset.kind === 'pick' && asset.round === 1).map((asset) => {
    if (Number(asset.year) >= 2027 && banned.has(asset.protection)) {
      return line('fail', '2027-29 protection restriction', `${asset.year} first-round picks cannot be newly traded with ${asset.protection.toLowerCase()} protection under the lottery rules beginning with the 2027 Draft.`, `protection-${asset.id}`)
    }
    return line('pass', `${asset.year} pick protection`, asset.protection === 'Unprotected' ? 'Unprotected.' : `${asset.protection} protected.`, `protection-${asset.id}`)
  })
}

export function validateTradeTeam({
  team,
  preSalary,
  outgoingSalary,
  incomingSalary,
  outgoingPlayerCount,
  incomingPlayerCount,
  rosterCount,
  outgoingAssets = [],
  currentYear = 2026,
  cba = CBA_2026_27,
}) {
  const salary = salaryMatchForTeam({
    preSalary,
    outgoing: outgoingSalary,
    incoming: incomingSalary,
    outgoingCount: outgoingPlayerCount,
    incomingCount: incomingPlayerCount,
    cba,
  })
  const lines = [...salary.lines]
  lines.push(rosterCheck({ rosterCount, outgoingCount: outgoingPlayerCount, incomingCount: incomingPlayerCount }))
  lines.push(...stepienCheck({ assets: outgoingAssets, currentYear }))
  lines.push(...protectionCheck(outgoingAssets))

  if (salary.postSalary > cba.secondApron && outgoingAssets.some((asset) => asset.kind === 'pick' && asset.round === 1 && Number(asset.year) === cba.maxFuturePickYear)) {
    lines.push(line('review', 'Second-apron frozen-pick check', `${team.abbr} is projected above the second apron and is sending the farthest-out first-round pick. Frozen-pick status depends on prior season-end apron history and must be verified.`, 'frozen-pick'))
  }

  if (outgoingAssets.some((asset) => asset.kind === 'swap')) {
    lines.push(line('review', 'Pick-swap ownership', 'Swap rights are modeled in the proposal, but NBACAB does not yet have a league-wide verified historical pick-rights ledger to prove the offered swap is owned and unencumbered.', 'swap-ownership'))
  }

  const status = strongestStatus(lines)
  return {
    status,
    team,
    method: salary.method,
    maxIncoming: salary.maxIncoming,
    postSalary: salary.postSalary,
    lines,
  }
}

export function overallTradeStatus(teamResults) {
  return strongestStatus(teamResults.flatMap((result) => result.lines))
}
