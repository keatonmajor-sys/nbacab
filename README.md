# NBACAB

NBA Coffee & Burritos — a visual NBA roster, stats, salary and CBA playground.

## V2: live rosters

This build includes:

- React + Vite
- React Router
- All 30 NBA teams on the home page
- Clickable team routes
- A secure Vercel serverless proxy at `/api/roster`
- Live active-player rosters from BALLDONTLIE
- A provisional visual PG / SG / SF / PF / C depth-chart layout
- No BALLDONTLIE API key exposed to the browser or committed to GitHub

## Required Vercel environment variable

`BALLDONTLIE_API_KEY`

The value should be stored as a Vercel Secret for Production, Preview and Development.

## Next build

Add better roster ordering / editable starters, player imagery, and season stats.
