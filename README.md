# NBACAB V12

Mobile card sizing refinement:
- Removes inherited starter-card minimum height that caused blank space below stats.
- Cards now shrink-wrap photo + name + six-stat stack.
- Stat typography is increased responsively to the largest practical size for the five-column mobile layout.
- Photo remains the drag zone; name/stats remain the player-detail tap zone.

# NBACAB V7 — Depth Slots + Mobile Five-Column View

- Drag players between any starter or backup slot at any position.
- Every depth column now has insertion zones between players so dropping under Kessler places Looney directly behind him.
- Listed BALLDONTLIE position never restricts placement.
- Mobile keeps PG / SG / SF / PF / C visible at the same time.
- Mobile cards are intentionally compact: photo, player name, and one chosen stat.
- Mobile stat selector defaults to PTS and supports PTS, REB, AST, FG%, 3P%, FT%, 3PM, STL, BLK, and TOV.
- Desktop keeps the richer ten-stat cards and player detail popup.


## V8 changes
- Every player card is now a full-size drop target. Drop onto a bench player to take that exact depth slot; that player and everyone below shift down one.
- Starter-on-starter drops now swap positions. Example: drag Luka onto Reaves and Luka becomes SG while Reaves becomes PG.
- Each position still has a large end-of-depth drop zone while dragging, so adding someone to the bottom never requires hitting a tiny target.
- Listed BALLDONTLIE positions remain reference-only and never restrict placement.

## V9
- Lineups are always editable; no Edit/Done mode required.
- Reset expected is always available.
- Mobile cards show six compact stats at once: PTS, REB, AST, BLK, STL, 3PM.


## V10
- Mobile stats are now a readable 1-column x 6-row stack: PTS, REB, AST, BLK, STL, 3PM.
- Removed the tiny 3x2 stat-box presentation while preserving the five-position mobile depth chart.


## V11
- Mobile Move button/blank footer removed.
- Photo remains the drag surface.
- Player name/stats area opens the player detail card.
- Six mobile stats use the recovered vertical space with larger type.

## V14 — 2026-27 contracts + cap overview
- Contract season explicitly targets 2026-27 during the current offseason.
- Stats remain the latest completed/available season (2025-26 until 2026-27 games exist).
- Contract coverage now reports matched active roster players rather than raw rows returned.
- Player modal defaults to current/future salary rows; previous salary history is collapsed.
- Added 2026-27 official NBA cap, tax, first-apron and second-apron thresholds.
- Team cap position is labeled as an estimate based on matched BALLDONTLIE active-roster cap hits; it does not pretend unmatched contracts/non-roster charges are zero.

## V15 — contract reliability + universal cap fallback

- Contract priority is now BALLDONTLIE GOAT first, then Spotrac for missing 2026-27 cap hits, then Basketball Reference as a salary-only last fallback.
- Spotrac fallback is team-agnostic and mapped for all 30 NBA teams.
- Spotrac player links are retained so a fallback player's current/future contract rows can be loaded when the player card opens.
- Basketball Reference rows are intentionally not counted as exact cap hits because salary and CBA cap hit can differ.
- The contract header now reports fallback usage.
- The cap overview prefers Spotrac's team-level Total Cap / allocation number when the page is reachable; otherwise it uses the sum of exact matched cap hits.
- NBA 2026-27 thresholds remain the official values: cap $164.961M, tax $200.428M, first apron $209.015M, second apron $221.686M.
- RealGM remains a useful manual cross-check for transactions and league threshold history, but V15 does not depend on scraping it at runtime.

## V16 — roster reconciliation / freshness

NBACAB no longer assumes a single roster API is always current during the offseason.

- BALLDONTLIE remains the primary structured active-player feed.
- ESPN is used as a second roster signal and photo source.
- NBA.com's 2026 offseason team-by-team transaction tracker is fetched server-side and used to reconcile confirmed additions/departures when the structured feed lags.
- A tiny source-backed emergency override list protects against very recent confirmed moves while external feeds/pages catch up. The first test case is Jonathan Kuminga: Atlanta -> Minnesota on Aug. 26, 2026.
- The roster endpoint now returns provenance/debug metadata: source availability, applied additions/removals, unresolved additions, ESPN-only/BDL-only conflicts, and exact override reasons.
- Roster cache was shortened to 5 minutes (15-minute stale window) so offseason moves propagate substantially faster.
- Contracts, stats and cap calculations automatically operate on the reconciled roster returned to the frontend, so stale players no longer contaminate downstream team data.

The emergency override list is not intended to become a manually curated roster database. It is a safety valve. Confirmed transaction parsing and primary/secondary roster feeds remain the normal path.


## V17 — projected starters + rotation depth charts
- Adds `/api/depth-chart.js`. RealGM is the primary projected depth-chart source for all 30 teams.
- ESPN is the free secondary starter-validation source. RotoWire is also queried opportunistically, but its full depth charts may be subscriber-only. RealGM remains the primary rotation-order source.
- Maps projected PG/SG/SF/PF/C starter and rotation order onto NBACAB's reconciled live roster.
- External depth-chart rows never add stale/non-roster players by themselves; unmatched names are ignored and all reconciled roster players are retained.
- Adds lineup source, season and confidence/source-agreement messaging.
- Saved user lineups remain untouched and continue to override projected lineup ordering on that device.
- Reset Expected now returns to the latest projected depth chart instead of the old provisional algorithm whenever the feed is available.
