export const CBA_2026_27 = {
  season: 2026,
  salaryCap: 164_961_000,
  tax: 200_428_000,
  firstApron: 209_015_000,
  secondApron: 221_686_000,
  minimumTeamSalary: 148_465_000,
  // 2024-25 CBA 101: $7.752M, increasing annually at the same rate as the Salary Cap.
  expandedTpeDelta: Math.round(7_752_000 * (164_961_000 / 140_588_000)),
  tpeAllowance: 250_000,
  maxStandardRoster: 15,
  normalMinStandardRoster: 14,
  maxTwoWayRoster: 3,
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

function line(status, title, detail, code, group = 'cba') {
  return { status, title, detail, code, group }
}

function finiteMoneyList(values) {
  return (Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isFinite(value) && value >= 0)
}

function canPackIntoCapacities(items, capacities) {
  const sortedItems = [...items].sort((a, b) => b - a)
  const bins = [...capacities].sort((a, b) => b - a)
  if (!sortedItems.length) return true
  if (!bins.length) return false
  const memo = new Set()

  function visit(index) {
    if (index >= sortedItems.length) return true
    const key = `${index}|${bins.map((value) => Math.round(value)).sort((a, b) => b - a).join(',')}`
    if (memo.has(key)) return false
    memo.add(key)
    const item = sortedItems[index]
    let previousCapacity = null
    for (let i = 0; i < bins.length; i += 1) {
      if (bins[i] + 1 < item) continue
      if (previousCapacity != null && Math.abs(previousCapacity - bins[i]) < 1) continue
      previousCapacity = bins[i]
      bins[i] -= item
      if (visit(index + 1)) return true
      bins[i] += item
    }
    return false
  }

  return visit(0)
}

function salaryMatchForTeam({ preSalary, outgoingSalaries, incomingSalaries, cba }) {
  const outgoing = outgoingSalaries.reduce((sum, value) => sum + value, 0)
  const incoming = incomingSalaries.reduce((sum, value) => sum + value, 0)
  const postSalary = Number.isFinite(preSalary) ? preSalary - outgoing + incoming : null

  if (!Number.isFinite(preSalary)) {
    return {
      status: 'review',
      method: 'Team salary unavailable',
      maxIncoming: null,
      postSalary,
      usesAggregation: false,
      hardCap: null,
      lines: [line('review', 'Team salary needs verification', 'NBACAB has player salaries, but not a trustworthy full team-salary ledger for this team.', 'team-salary-missing', 'salary')],
    }
  }

  if (!outgoingSalaries.length && !incomingSalaries.length) {
    return {
      status: 'pass', method: 'No player salary movement', maxIncoming: 0, postSalary, usesAggregation: false, hardCap: null,
      lines: [line('pass', 'No player salary movement', 'Only draft assets move for this team, so no player-salary matching exception is required.', 'no-player-salary', 'salary')],
    }
  }

  const lines = []
  const postAboveFirst = postSalary > cba.firstApron
  const allowance = postAboveFirst ? 0 : cba.tpeAllowance

  // A room team can absorb incoming salary with its available room after accounting for outgoing salary.
  if (preSalary < cba.salaryCap) {
    const capRoomAfterOutgoing = Math.max(0, cba.salaryCap - (preSalary - outgoing))
    const maxIncoming = capRoomAfterOutgoing + allowance
    const ok = incoming <= maxIncoming + 1
    lines.push(line(ok ? 'pass' : 'fail', 'Cap-room salary matching', ok
      ? `Incoming salary fits within the team’s post-outgoing cap room${allowance ? ' plus the $250K allowance' : ''}.`
      : `Incoming salary exceeds the team’s cap-room trade capacity by $${Math.round(incoming - maxIncoming).toLocaleString()}.`, 'cap-room', 'salary'))
    return { status: ok ? 'pass' : 'fail', method: 'Cap room', maxIncoming, postSalary, usesAggregation: false, hardCap: null, lines }
  }

  // Standard TPEs can be kept separate. This is the only salary-match path that does not itself impose an apron hard cap.
  // We test whether incoming contracts can be assigned among the separate outgoing-player TPE buckets.
  const standardCapacities = outgoingSalaries.map((salary) => salary + allowance)
  const separateStandardWorks = canPackIntoCapacities(incomingSalaries, standardCapacities)
  if (separateStandardWorks) {
    lines.push(line('pass', 'Standard TPE — no aggregation', postAboveFirst
      ? 'Incoming contracts can be matched to separate outgoing-player TPEs without aggregating salaries. The $250K allowances are zero because post-trade salary is above the first apron.'
      : 'Incoming contracts can be matched to separate outgoing-player TPEs without aggregating salaries.', 'standard-tpe-separate', 'salary'))
    return {
      status: 'pass', method: 'Standard TPE', maxIncoming: standardCapacities.reduce((sum, value) => sum + value, 0), postSalary,
      usesAggregation: false, hardCap: null, lines,
    }
  }

  // Aggregated Standard TPE: total outgoing + $250K; using it hard-caps the team at the second apron.
  const aggregatedMax = outgoing + allowance
  const aggregatedMoneyWorks = incoming <= aggregatedMax + 1
  const aggregatedApronWorks = postSalary <= cba.secondApron + 1
  if (aggregatedMoneyWorks && aggregatedApronWorks && outgoingSalaries.length > 1) {
    lines.push(line('pass', 'Aggregated Standard TPE', 'The selected outgoing salaries can be aggregated and the resulting team salary remains at or below the second apron.', 'aggregated-standard-tpe', 'salary'))
    lines.push(line('pass', 'Second-apron hard cap', `Using the aggregated Standard TPE hard-caps this team at the second apron; projected team salary remains within that limit.`, 'second-apron-hard-cap', 'apron'))
    return {
      status: 'pass', method: 'Aggregated Standard TPE', maxIncoming: aggregatedMax, postSalary,
      usesAggregation: true, hardCap: 'secondApron', lines,
    }
  }

  // Expanded TPE: larger matching band, but its use hard-caps the team at the first apron.
  const expandedMax = Math.max(
    Math.min((2 * outgoing) + cba.tpeAllowance, outgoing + cba.expandedTpeDelta),
    (1.25 * outgoing) + cba.tpeAllowance,
  )
  const expandedMoneyWorks = incoming <= expandedMax + 1
  const expandedApronWorks = postSalary <= cba.firstApron + 1
  if (expandedMoneyWorks && expandedApronWorks && outgoingSalaries.length > 0) {
    lines.push(line('pass', 'Expanded traded-player exception', 'Incoming salary fits the Expanded TPE and projected team salary remains at or below the first apron.', 'expanded-tpe', 'salary'))
    lines.push(line('pass', 'First-apron hard cap', 'Using the Expanded TPE hard-caps this team at the first apron; projected team salary remains within that limit.', 'first-apron-hard-cap', 'apron'))
    return {
      status: 'pass', method: 'Expanded TPE', maxIncoming: expandedMax, postSalary,
      usesAggregation: outgoingSalaries.length > 1, hardCap: 'firstApron', lines,
    }
  }

  // Explain the best-known reason no salary path works.
  if (outgoingSalaries.length > 1 && aggregatedMoneyWorks && !aggregatedApronWorks) {
    lines.push(line('fail', 'Second-apron aggregation restriction', `This deal needs outgoing salaries aggregated, but that path would leave the team above the $${Math.round(cba.secondApron).toLocaleString()} second apron.`, 'second-apron-aggregation', 'apron'))
  }
  if (expandedMoneyWorks && !expandedApronWorks) {
    lines.push(line('fail', 'First-apron Expanded TPE restriction', 'The Expanded TPE could match the money, but using it would leave the team above the first apron, so that exception is unavailable.', 'expanded-tpe-hard-cap', 'apron'))
  }
  if (!aggregatedMoneyWorks && !expandedMoneyWorks) {
    const maxIncoming = Math.max(aggregatedMax, expandedMax)
    lines.push(line('fail', 'Salary matching', `Incoming salary is $${Math.round(incoming - maxIncoming).toLocaleString()} above the largest otherwise-available matching amount before apron restrictions are applied.`, 'salary-match-fail', 'salary'))
  }
  if (!lines.length) {
    lines.push(line('fail', 'Salary matching', 'The incoming contracts cannot be assigned to separate Standard TPEs, and no aggregated exception is available within the applicable apron limit.', 'salary-match-fail', 'salary'))
  }

  return {
    status: 'fail', method: 'No legal salary-match path found', maxIncoming: Math.max(aggregatedMax, expandedMax), postSalary,
    usesAggregation: outgoingSalaries.length > 1, hardCap: null, lines,
  }
}

function rosterCheck({ rosterSnapshot, outgoingRosterTypes = [], incomingRosterTypes = [], cba }) {
  if (!rosterSnapshot || !Number.isFinite(rosterSnapshot.standardKnown)) {
    return line('review', 'Roster count needs verification', 'Standard-contract roster classification is unavailable.', 'roster-count', 'roster')
  }

  const outgoingUnknown = outgoingRosterTypes.filter((value) => value === 'unknown').length
  const incomingUnknown = incomingRosterTypes.filter((value) => value === 'unknown').length
  const initialUnknown = Number(rosterSnapshot.unknown || 0)
  const twoWayKnown = Number(rosterSnapshot.twoWayKnown || 0)
  const standardKnown = Number(rosterSnapshot.standardKnown || 0)
  const standardOut = outgoingRosterTypes.filter((value) => value === 'standard').length
  const standardIn = incomingRosterTypes.filter((value) => value === 'standard').length
  const projectedKnownStandard = standardKnown - standardOut + standardIn

  if (twoWayKnown > cba.maxTwoWayRoster) {
    return line('review', 'Two-way roster classification', `NBACAB classified ${twoWayKnown} players as two-way, above the normal three-player limit. Source labels need verification before roster legality can be graded.`, 'two-way-roster-review', 'roster')
  }

  if (initialUnknown > 0 || outgoingUnknown > 0 || incomingUnknown > 0) {
    const knownSummary = `${projectedKnownStandard} confirmed standard contracts after the trade; ${initialUnknown} current roster ${initialUnknown === 1 ? 'entry remains' : 'entries remain'} unclassified.`
    return line('review', 'Standard-roster count', `${knownSummary} NBACAB will not fail a trade by treating two-way or unclassified players as standard contracts.`, 'roster-classification-review', 'roster')
  }

  if (projectedKnownStandard > cba.maxStandardRoster) {
    return line('fail', 'Too many standard contracts', `The trade would leave ${projectedKnownStandard} players on Standard NBA Contracts, above the 15-player maximum. Two-way players are excluded from this count.`, 'roster-max', 'roster')
  }
  if (projectedKnownStandard < cba.normalMinStandardRoster) {
    return line('review', 'Roster fill required', `The trade would leave ${projectedKnownStandard} players on Standard NBA Contracts. Teams are generally required to carry 14 or 15, so a follow-up roster move or permitted short-term exception/grace period must be verified.`, 'roster-fill', 'roster')
  }
  return line('pass', 'Standard-roster count', `The trade leaves ${projectedKnownStandard} players on Standard NBA Contracts. Two-way players are counted separately.`, 'roster-count', 'roster')
}

function pickCouldRemoveFirst(asset) {
  return asset.kind === 'pick' && asset.round === 1
}

function stepienCheck({ assets, currentYear = 2026 }) {
  const firsts = assets.filter(pickCouldRemoveFirst)
  if (!firsts.length) return [line('pass', 'Stepien Rule', 'No outgoing first-round pick is included.', 'stepien', 'draft')]

  const removedYears = new Set(firsts.map((asset) => Number(asset.year)).filter(Number.isFinite))
  const years = [...removedYears].sort((a, b) => a - b)
  if (years.some((year) => removedYears.has(year + 1))) {
    return [line('fail', 'Stepien Rule', 'The proposal sends first-round rights in consecutive future drafts and would require retained/owned first-round rights in one of those years to be legal.', 'stepien', 'draft')]
  }

  if (firsts.some((asset) => Number(asset.year) <= currentYear)) {
    return [line('fail', 'Future-pick year', 'Only future draft rights can be traded in this trade builder.', 'pick-year', 'draft')]
  }

  // V19.1 deliberately refuses a green Stepien result until the league-wide ownership ledger is verified.
  if (firsts.some((asset) => asset.ownershipVerified !== true)) {
    return [line('review', 'Stepien / existing obligations', 'The selected years are not consecutive in this proposal, but NBACAB does not yet have a verified league-wide pick-ownership/encumbrance ledger. Existing protected obligations can still make the pick unavailable.', 'pick-ownership', 'draft')]
  }

  return [line('pass', 'Stepien Rule', 'Verified pick ownership shows the team retains a first-round pick in every required alternate draft.', 'stepien', 'draft')]
}

function protectionCheck(assets) {
  const banned = new Set(['Top 12', 'Top 13', 'Top 14', 'Top 15'])
  return assets.filter((asset) => asset.kind === 'pick' && asset.round === 1).map((asset) => {
    if (Number(asset.year) >= 2027 && banned.has(asset.protection)) {
      return line('fail', '2027+ protection restriction', `${asset.year} first-round picks cannot be newly traded with ${asset.protection.toLowerCase()} protection under the lottery rules beginning with the 2027 Draft.`, `protection-${asset.id}`, 'draft')
    }
    return line('pass', `${asset.year} pick protection`, asset.protection === 'Unprotected' ? 'Unprotected.' : `${asset.protection} protected.`, `protection-${asset.id}`, 'draft')
  })
}

function transactionTimingChecks({ outgoingPlayers = [], usesAggregation = false }) {
  const lines = []
  const recentlyMoved = outgoingPlayers.filter((player) => player?.nbacab_transaction_confirmed || player?.recently_acquired || player?.recently_signed)
  if (!recentlyMoved.length) return lines

  recentlyMoved.forEach((player) => {
    const name = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Selected player'
    const date = player.trade_eligible_at || player.trade_eligible_date || player.eligible_to_be_traded_at || null
    if (date) {
      const eligible = new Date(date).getTime()
      const now = Date.now()
      lines.push(line(Number.isFinite(eligible) && now < eligible ? 'fail' : 'pass', 'Trade eligibility date', Number.isFinite(eligible) && now < eligible
        ? `${name} is not eligible to be traded until ${new Date(eligible).toLocaleDateString('en-US')}.`
        : `${name} is past the available trade-eligibility date.`, `eligibility-${player.id}`, 'eligibility'))
    } else if (usesAggregation) {
      lines.push(line('review', 'Recently acquired/signed player', `${name} appears in NBACAB’s recent transaction reconciliation. Because this deal uses salary aggregation, the applicable waiting-period restriction needs a verified signing/acquisition date.`, `recent-${player.id}`, 'eligibility'))
    } else {
      lines.push(line('review', 'Recently acquired/signed player', `${name} appears in NBACAB’s recent transaction reconciliation. Trade eligibility depends on the exact signing/acquisition details, which are not yet present in the source data.`, `recent-${player.id}`, 'eligibility'))
    }
  })
  return lines
}

export function validateTradeTeam({
  team,
  preSalary,
  outgoingSalaries = [],
  incomingSalaries = [],
  rosterSnapshot,
  outgoingRosterTypes = [],
  incomingRosterTypes = [],
  outgoingPlayers = [],
  outgoingAssets = [],
  currentYear = 2026,
  cba = CBA_2026_27,
}) {
  const outgoingMoney = finiteMoneyList(outgoingSalaries)
  const incomingMoney = finiteMoneyList(incomingSalaries)
  const salary = salaryMatchForTeam({ preSalary, outgoingSalaries: outgoingMoney, incomingSalaries: incomingMoney, cba })
  const lines = [...salary.lines]
  lines.push(rosterCheck({ rosterSnapshot, outgoingRosterTypes, incomingRosterTypes, cba }))
  lines.push(...transactionTimingChecks({ outgoingPlayers, usesAggregation: salary.usesAggregation }))
  lines.push(...stepienCheck({ assets: outgoingAssets, currentYear }))
  lines.push(...protectionCheck(outgoingAssets))

  if (salary.postSalary > cba.secondApron && outgoingAssets.some((asset) => asset.kind === 'pick' && asset.round === 1 && Number(asset.year) === cba.maxFuturePickYear)) {
    lines.push(line('review', 'Second-apron frozen-pick check', `${team.abbr} is projected above the second apron and is sending the farthest-out first-round pick. Frozen-pick status depends on prior season-end apron history and must be verified.`, 'frozen-pick', 'draft'))
  }

  if (outgoingAssets.some((asset) => asset.kind === 'swap')) {
    lines.push(line('review', 'Pick-swap ownership', 'Swap rights are modeled in the proposal, but NBACAB does not yet have a verified league-wide ownership/priority ledger for multi-team swap chains.', 'swap-ownership', 'draft'))
  }

  return {
    team,
    status: strongestStatus(lines),
    method: salary.method,
    maxIncoming: salary.maxIncoming,
    postSalary: salary.postSalary,
    usesAggregation: salary.usesAggregation,
    hardCap: salary.hardCap,
    lines,
  }
}

export function overallTradeStatus(results) {
  return strongestStatus(results.map((result) => ({ status: result.status })))
}
