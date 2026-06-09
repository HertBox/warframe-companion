# Warframe Companion

A personal, mobile-first gameplay tracker + wiki lookup tool for Warframe.
Track which prime parts / mods you still need, see crafting materials and where
to farm them, and get cross-references when the same resource feeds multiple goals.

No database — persistence is just JSON files on disk, owned entirely by the
backend.

## Stack

- **frontend** — React + Vite, custom dark CSS, port `3000`
- **backend** — Node.js + Express, port `3001`

The frontend never calls the Warframe wiki directly; the backend proxies every
wiki request and owns the JSON store.

## Run with Docker Compose

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend:  http://localhost:3001

The backend creates `backend/data/objectives.json` and
`backend/data/completed.json` (each initialized to `[]`) on startup if missing.
These are bind-mounted, so your data survives container restarts.

## Run locally without Docker

```bash
# Terminal 1 — backend
cd backend
npm install
npm start          # listens on :3001

# Terminal 2 — frontend
cd frontend
npm install
npm run dev        # serves on :3000
```

If your backend runs on a different host/port, set `VITE_API_URL` for the
frontend (e.g. `VITE_API_URL=http://localhost:3001 npm run dev`).

## How it works

1. **Search** — type an item name (abbreviations like `neuro`, `sys`, `bp` are
   expanded). The backend hits the wiki search API and returns the top matches.
2. **Add** — tapping a result fetches the page's *Acquisition* / *Components*
   sections, parses parts (relic · rarity · drop%), drop sources, and crafting
   materials, then stores a structured objective.
3. **Track** — check off prime parts (optimistic UI), mark mods obtained, expand
   materials, and open relic detail views. The floating **⊞** button aggregates
   every material across all active objectives, shared ones first.
4. **Complete / delete** — the **⋮** menu moves an objective to
   `completed.json` (with a `completedAt` timestamp). Re-add from the
   *Completados* section.

### Caching

Parsed wiki data is stamped with `cachedAt`. Re-adding a recently-completed
item reuses cached data if it's under 7 days old. Use the **↻** button in a
card's menu to force a fresh re-parse from the wiki.

### Parsing fallback

If wikitext parsing yields no parts/sources, the backend automatically falls
back to fetching the rendered HTML and scraping table rows (a warning is logged
to the backend console). If no Acquisition section exists at all, the item is
returned as `parsingFailed` and the UI surfaces a "Ver en wiki ↗" hint instead
of crashing.

## Project layout

```
warframe-companion/
  docker-compose.yml
  backend/
    src/
      index.js          Express entry, CORS, route mounting, store init
      store.js          ONLY module that reads/writes JSON (write-queued)
      wikiAPI.js        ONLY module that fetches the wiki (no fs)
      parser.js         ONLY parsing logic (no fetch, no fs)
      routes/
        search.js       POST /api/search
        objectives.js   CRUD + completed + refresh
        proxy.js        GET /api/wiki/proxy
    data/               objectives.json, completed.json
  frontend/
    src/
      App.jsx           root state + optimistic mutations
      api.js            ONLY module that calls the backend
      components/       Header, SearchBar, FilterChips, ObjectiveCard,
                        CompletedSection, MaterialsPanel, DetailView,
                        LoadingSkeleton, Toast
      styles/global.css dark theme + layout
```

## Architectural rules

- Frontend → backend only (never the wiki directly).
- `store.js` is the only filesystem touchpoint.
- `parser.js` has zero fetch calls; `wikiAPI.js` has zero filesystem calls.
- Plain JavaScript throughout, no TypeScript, no external UI libraries.
