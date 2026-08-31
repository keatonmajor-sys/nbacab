# NBACAB

NBA Coffee & Burritos — a visual NBA roster, stats, salary and CBA playground.

## V4

This build includes:

- React + Vite
- All 30 NBA teams
- Live active rosters from BALLDONTLIE
- Team logos and matched player headshots
- 2025-26 (or latest applicable season) regular-season averages calculated from BALLDONTLIE game-player stats
- PTS / REB / AST directly on roster cards
- Click/tap player detail panels with shooting percentages and additional per-game stats
- Server-side API key protection through Vercel functions
- Graceful fallbacks when photos or stats are unavailable

## Data notes

The current ALL-STAR BALLDONTLIE plan includes Game Player Stats but not the Season Averages endpoint. NBACAB therefore calculates per-game averages from regular-season game stat rows and caches the result at the Vercel edge.

## Next build

Editable depth charts and persistence, followed by salary/contract source integration and the CBA layer.
