# NBACAB

NBA Coffee & Burritos — a visual NBA roster, stats, salary and CBA playground.

## V3

This build includes:

- React + Vite
- React Router
- All 30 NBA teams on the home page
- Team logos
- Live active rosters from BALLDONTLIE through a private Vercel API route
- Player headshot matching from ESPN team roster data, with initials fallbacks
- Visual PG / SG / SF / PF / C depth-chart layout
- Large starter cards with player cutouts
- Responsive mobile layout
- No API key or secret committed to GitHub

## Environment variable

Vercel must contain:

`BALLDONTLIE_API_KEY`

## Next build

Add current player statistics, followed by editable/saved depth charts and salary/contract data.
