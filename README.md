# NBACAB V19.1 — Trade Machine QA + CBA Corrections

Built from V19.

## What changed

- Corrected standard-roster validation so two-way and unclassified players are not blindly counted toward the 15-player standard-contract maximum.
- Added conservative roster classification from contract/source metadata. Unknown roster types now produce `Needs review` instead of false failures.
- Reworked salary matching into explicit legal paths:
  - cap room
  - separate Standard TPEs (no aggregation)
  - Aggregated Standard TPE (second-apron hard cap)
  - Expanded TPE (first-apron hard cap)
- Added contract-by-contract matching for separate Standard TPEs so multi-player trades do not automatically count as salary aggregation.
- Added explicit first-/second-apron hard-cap checks tied to the exception actually used.
- Added recent signing/acquisition review behavior when NBACAB's roster reconciliation flags a recently moved player but does not have a verified eligibility date.
- Tightened Stepien behavior: future first-round picks no longer receive a green ownership/Stepien result when the league-wide pick ledger is unverified.
- Pick swaps remain `Needs review` until a verified swap-priority/ownership ledger exists.
- Reordered trade results so failures/review items are shown first; successful checks are collapsed under `Passed checks`.
- Fixed top spacing on the Trade Machine page so the hero does not clip under the page/header area.
- Spotrac team contract parsing now retains a contract-type/status field when the source table exposes one, improving two-way/standard classification.

## Accuracy policy

V19.1 is intentionally conservative. A rule is only green when NBACAB has enough source data to support the result. Missing roster classification, pick ownership, swap priority, or transaction-eligibility dates are surfaced as `Needs review` rather than guessed.

## CBA basis

The validator uses the NBA's 2026-27 announced thresholds and current CBA framework for Standard, Aggregated Standard, Expanded TPEs, first-/second-apron transaction restrictions, roster limits, and two-way roster separation.

## Still not a complete league transaction ledger

V19.1 does not yet include a verified all-30-team future-pick ownership/protection database or a complete transaction-date ledger. Those are data-source projects, not UI assumptions, and the validator reflects that distinction.
