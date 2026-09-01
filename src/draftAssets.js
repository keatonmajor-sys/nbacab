export const PICK_PROTECTIONS = ['Unprotected', 'Top 1', 'Top 3', 'Top 5', 'Top 10', 'Lottery']

export function ownDraftAssets(team, startYear = 2027, endYear = 2033) {
  const assets = []
  for (let year = startYear; year <= endYear; year += 1) {
    assets.push({
      id: `${team.abbr}-${year}-1-own`,
      kind: 'pick',
      year,
      round: 1,
      originAbbr: team.abbr,
      label: `${year} ${team.abbr} 1st`,
      protection: 'Unprotected',
      ownershipVerified: false,
      sourceLabel: 'Own-pick slot · ownership not verified',
    })
    assets.push({
      id: `${team.abbr}-${year}-2-own`,
      kind: 'pick',
      year,
      round: 2,
      originAbbr: team.abbr,
      label: `${year} ${team.abbr} 2nd`,
      protection: 'Unprotected',
      ownershipVerified: false,
      sourceLabel: 'Own-pick slot · ownership not verified',
    })
    assets.push({
      id: `${team.abbr}-${year}-swap-own`,
      kind: 'swap',
      year,
      round: 1,
      originAbbr: team.abbr,
      label: `${year} ${team.abbr} 1st swap`,
      protection: 'Unprotected',
      ownershipVerified: false,
      sourceLabel: 'Swap right · ownership not verified',
    })
  }
  return assets
}
