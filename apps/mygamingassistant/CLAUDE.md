# MyGamingAssistant — CLAUDE.md

## Project

**MyGamingAssistant** — a single-user, self-hosted lineup and utility management tool
for tactical FPS games (Valorant, CS2). Core value: store and visualize lineup throws
overlaid on game minimaps. Also hosts **companion** games — static per-game pages
with no maps (currently World of Warcraft: Forever: a World Map, a New Player Guide
and an Item Compare tool). Part of the MyFreeApps monorepo.

**Single-user app:** There is NO `/register` route. The operator account is seeded at
boot time from `SEED_USER_EMAIL` + `SEED_USER_PASSWORD_HASH` env vars. Production boot
fails loudly if those vars are missing.

## Canonical App

**MyBookkeeper is the canonical app.** MyGamingAssistant mirrors MBK for all Tier-1
and Tier-2 infrastructure byte-for-byte (auth, security, Docker, Caddy, deploy workflow)
except for:
- App name, ports, and domain
- Single-user design (no /register route, seed user from env)
- Domain models (Game, Map, MapZone, Site, UtilityType, Source, Lineup, etc.)

Before adding any infrastructure feature to MGA, open the matching MBK file first.

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI, Python 3.12, SQLAlchemy 2.0 (async), PostgreSQL 16, Alembic, Pydantic 2 |
| Auth | fastapi-users, JWT Bearer |
| AI | Anthropic Claude SDK (future phases) |
| Shared infra | `packages/shared-backend/platform_shared` |

## Directory Map

```
apps/mygamingassistant/
├── backend/
│   ├── alembic/               DB migrations
│   ├── app/
│   │   ├── api/               Flat route handlers (thin — delegate to services)
│   │   ├── cli/               CLI entrypoint — python -m app.cli load-fixtures
│   │   ├── core/              Config, auth, enums, security, permissions
│   │   ├── db/                Session factory + Base (re-exports from platform_shared)
│   │   ├── fixtures/          JSON fixture files (games, maps, utility types)
│   │   ├── models/            Domain-per-directory ORM models
│   │   ├── schemas/           Domain-per-directory Pydantic schemas
│   │   └── services/          Business logic services
│   └── tests/
├── desktop/                   Reserved — Tauri shell (Phase 7)
├── docker/
├── docker-compose.yml
└── CLAUDE.md
```

## Port Assignments

| Service | Port |
|---|---|
| Caddy (docker) | 8096 (host) → :80 (container) |
| Backend (uvicorn) | 8004 |
| Frontend (dev) | 5176 |
| PostgreSQL (dev) | see docker-compose.yml |

Domain: `mygamingassistant.myfreeapps.org`

## Domain Models

### Game domain
- `game` — slug + name + `kind` + side labels (attacker/defender or T/CT)
  - `kind` is `lineups` (map/lineup library) or `companion` (static feature pages,
    no maps — WoW Forever). CHECK `ck_game_kind`.
  - Side labels are nullable; `ck_game_lineup_side_labels` requires them on
    `lineups` games. The classifier's reference data only lists `lineups` games.
- `map` — belongs to game; slug + name + minimap URL
- `map_zone` — polygon overlay zones on a map (A main, B site, etc.)
- `site` — bomb sites / objective sites on a map
- `utility_type` — per-game utility types (smoke, flash, molotov, recon, etc.)

### Lineup domain
- `source` — a throwing position on a map for a utility
- `lineup` — A → B trajectory (source + destination zone/site, side, description)
- `lineup_package` — named collection of lineups
- `lineup_package_lineup` — M2M join

## Per-game features (game registry)

A lineup game uses the generic pages under `/:gameSlug`. A companion game owns its
own pages, registered in `frontend/src/games/registry.ts` and routed by
`frontend/src/games/<slug>/routes.tsx`, which `src/routes.tsx` mounts BEFORE
`/:gameSlug`. `GameGrid` links every card through `getGameLandingPath()`. Game
pickers in the lineup library use `useLineupGames()` so companion games never
appear where a map must be chosen.

To add a companion game: a `kind: "companion"` row in `app/fixtures/games.json`,
a registry entry, and a `src/games/<slug>/` folder (data, components, pages, routes).

### WoW Forever (`/wow-forever`, `/wow-forever/map`, `/wow-forever/guide`, `/wow-forever/professions`, `/wow-forever/food`, `/wow-forever/compare`)

- All public, static, frontend-only. Content is typed data under
  `src/games/wow-forever/data/` — don't state Forever facts that aren't published.
- Cooking & Fishing (`/wow-forever/professions`, `?p=cooking|fishing`) is
  pre-launch data in `data/professions/`: every row carries
  `confidence: "confirmed" | "unconfirmed"`. After Forever launches, re-check
  the unconfirmed rows and bump `PROFESSIONS_DATA_STATUS`.
- Class/spec ids in `data/classes.ts` are the stable key for anything
  class-shaped (stat weights, compare settings, a future BiS page). Never rename.
- **Scoring lives in the frontend** (`scoring/`), deterministic and unit-tested.
  Level 60 weights: Pawn's Classic Era scales (HawsJon) in
  `data/weights/pawnClassicWeights.ts` — the header cites the source commit.
  Leveling: documented heuristic in `levelingWeights.ts`. Stats a spec has no
  weight for are shown as "not scored", never silently 0.
- Pasted tooltip text is parsed in the browser (`parsing/`), so compare works
  signed out and in the serve-only deployment.
- Screenshot reading calls `POST /api/wow/items/extract` (Claude tool-use, nothing
  stored). It is PUBLIC and mounted in BOTH modes (serve-only prod included),
  gated in order by: availability (503 `item_reader_unavailable` when
  `ANTHROPIC_API_KEY` is unset, `WOW_EXTRACT_DAILY_CAP<=0`, or — serve-only /
  production — `TURNSTILE_SECRET_KEY` is unset) → per-IP limit (20/h) →
  shared Turnstile dependency (`X-Turnstile-Token`) → input validation →
  durable global daily cap (`daily_usage_counters`, platform_shared
  `try_consume_daily_quota`; 429 `item_reader_daily_limit_reached`). No boot
  guard — an unconfigured reader degrades to 503 and the UI to manual entry.
  The frontend only offers it in serve-only builds when `VITE_TURNSTILE_SITE_KEY`
  is baked into the bundle (GitHub Actions variable
  `MYGAMINGASSISTANT_VITE_TURNSTILE_SITE_KEY`).
- The reader's tool call transcribes the tooltip first (`tooltip_lines`, stopping
  at the game's "If you replace this item" comparison); `item_response_mapper`
  drops any stat whose number isn't on those lines, with a warning. The UI
  (`ScreenshotReader`) takes a screenshot by a "Paste screenshot" button
  (Clipboard API), Ctrl+V in the focused box, file or drop — and keeps the
  image on screen before and after reading so it can be checked.
- Stat keys / slots / qualities exist on both sides —
  `tests/test_wow_stat_keys_parity.py` fails CI on drift.

#### Food picker (`/wow-forever/food`, "What should I eat?")

- Level + class + spec + activity (Leveling / Dungeon / Raid / PvP / Fishing /
  Just healing) + optional Cooking skill → best pick, runners-up (same-effect
  foods folded into one row), "Worth training for" (better but above your
  skill) and "Next upgrade at level N". Settings live in the URL
  (`?lvl&class&spec&act&skill`, replace-history) and
  `mga.wowForever.food.settings.v1`; first visit seeds level/class from the
  World Map player settings.
- **Data is GENERATED** — `python -m scripts.wow_food.build` (from `backend/`)
  writes `data/food/foods.json` from the Forever beta client (SkillLine 185
  recipes → created item → its use spell → Food/Drink + Well Fed spell). Buffs
  are parsed from the client's evaluated tooltip text (`scripts/wow_food/tooltip.py`
  evaluates `$s/$o/$t/$d/$@spelldesc` tokens), never from aura codes.
  `data/food/classic/trainerSkills.json` (trainer recipe skill) is cmangos
  GPL data — keep its LICENSE + README. `tests/test_wow_food_generator.py`.
- Ranking (`food/`, pure, unit-tested): leveling uses the class leveling rule
  of thumb; other activities use Pawn's Classic spec weights. Attack power
  counts once (max of melee/ranged), healing only for healers, a healer's
  `spell_power` never counts as spell damage, PvP lifts Stamina to your main
  stat's worth. Feasts only for Dungeon/Raid. The +5% kill-XP is shown as
  Unconfirmed (conditions unpublished).
- **Food detail** (`/wow-forever/food/:foodId`, `pages/WowFoodDetailPage.tsx`):
  every food name in the picker links here, carrying the picker query so Back
  returns to the same answer. Shows what it does, how to learn it (skill
  learn/green/grey; vendors, quests, drops, containers), each ingredient's
  sources, and what to cook it at (`focus`: Cooking Fire / Forever's Iron Oven).
  Vendors: player faction (World Map settings) + neutral first, other faction
  behind a toggle; Directions go to `/wow-forever/map?to=pt:<zone>,<x>,<y>&dir=1`
  (vendors aren't World Map POIs, so `npc:` doesn't resolve). Each farmable
  mob carries a spot — its densest pack (spawns within 150 yd) in the zone it's
  most common in — with the same Directions link. Reagents you can
  buy, fish or open from a container hide their mob-drop list.
  Sources are `data/food/classic/recipeSources.json` — cmangos Classic data
  from `scripts/wow_food/recipe_sources.py`, GPL, same LICENSE. Items with id
  ≥ 100000 are new in Forever and have no source data.

#### World Map (`/wow-forever/map`)

- Frontend-only, static data under `src/games/wow-forever/data/worldMap/`, logic
  in `src/games/wow-forever/worldMap/` (pure, unit-tested), page in
  `pages/WowWorldMapPage.tsx`. Player choices (faction/class/zone/level/position)
  live in localStorage key `mga.wowForever.worldMap.player.v1` — preferences
  only, never world data.
- **Data is GENERATED — never hand-edit the JSON.** Re-run from `backend/`:
  `python -m scripts.wow_world_map.build [--no-art]`. Sources are pinned in
  `scripts/wow_world_map/sources.py` (wago.tools DB2 export of the Forever beta
  client for zones/flight paths/map art/factions; cmangos classic-db at a
  pinned commit for NPCs). `tests/test_wow_world_map_generator.py` checks the
  coordinate conversion against wiki NPC positions and the committed output.
- **Licensing:** `data/worldMap/classic/` is derived from cmangos classic-db,
  GPL-3.0 — keep its LICENSE + README (commit SHA) next to the data. No cmangos
  code is copied; no Questie/ForeverGuide/Wowhead data. Every Classic row is
  labelled "Classic location — may differ in Forever" in the UI.
- **Map art:** `frontend/public/wow-maps/<uiMapId>.webp` (WebP q70, 1002×668,
  fully explored) stitched from the Forever client's map tiles — © Blizzard
  Entertainment, shown for reference in a free fan tool. One image loads per
  viewed zone. See `public/wow-maps/README.md`.
- **Navigation like the in-game map.** `zones.json` carries every map's UiMap
  `parent` (Azeroth `947` → continents → zones → capitals), `levels` and
  `territory`; `decodeMapTree` builds the tree. The viewed map lives in the URL
  (`?m=<uiMapId>`, pushed on navigation so browser Back = zoom out); with no `m`
  the page follows the player's zone. Browsing never changes the saved
  position — only a click on your own zone's map (or a confirmed "Set position
  here") does. Zoom out = button, breadcrumb, right-click or Esc.
- **Hit-testing** (`worldMap/mapHitTest.ts`, mirrors `C_Map.GetMapInfoAtPosition`):
  on a continent/world view the candidates are the children; on a zone view,
  its siblings. A candidate must cover the point with its mask
  (`mapMasks.json`, 120×80 bits from the zone's highlight art, zones only) —
  continents are covered via their child zones because their highlight art is
  only a coastline. Smallest area wins; a click that resolves to nothing never
  navigates.
- **Neighbour labels** (`worldMap/mapNeighbours.ts`): a zone's neighbours are
  the siblings its land actually touches — rays marched out from every border
  cell of its mask hit the first sibling outline (never a zone that is merely
  on the same picture). Each label sits on the side / at the point where that
  contact is. Labels live in a reserved band OUTSIDE the picture
  (`edgeLabelLayout.ts`, `MapEdgeFrame`), so they never cover markers, and are
  pushed apart / shared along the band so they never overlap —
  `wowWorldMapNeighbours.test.ts` checks every zone at several widths.
- **List ↔ map selection** (`hooks/useMapSelection.ts`): clicking / Enter on a
  result row opens that result's zone, zooms to it and highlights the marker
  (and the row); clicking a marker selects and scrolls to its row. A selection
  is let go of by clicking its row again, the row's "Clear" button, Esc (on the
  map Esc clears first and only zooms out when nothing is selected) or a click
  on the map. **Letting go puts the view back:** a row selection snapshots the
  view (map id + zoom + pan) first — selecting another row keeps the ORIGINAL
  snapshot — and every clear path (incl. Reset filters) restores it: the
  `?m=` pushes the selection made are undone with browser Back (`back(n)`, so
  history is as it was) and the zoom/pan is re-applied once that map is on
  screen. **Manual-navigation rule:** any map change the selection didn't
  make (zoom out, breadcrumb, neighbour label, map click, "Open a map",
  "Your zone"/"Destination" buttons, browser Back, changing your zone) or any
  hand zoom/pan (wheel, a drag on a zoomed map, "Reset zoom") while selected
  drops the snapshot — the player took control, so letting go only clears the
  highlight in place. A marker click on the map never moves the view, so it
  takes no snapshot of its own. "Reset filters" (`hooks/useFindFilters.ts`)
  restores the finding filters + map layers and clears the selection — never
  the "You" section (faction/class/zone/level/position).
- **Route planner — works like a maps app** (`RoutePlanner`, `hooks/useTripPlanner.ts`,
  `worldMap/trip.ts`, search in `worldMap/search.ts`): search an NPC, town,
  zone or coordinates ("Find an NPC or place" — name, title, kind like
  "cooking trainer", area; any word order, accent-insensitive; Enter on an
  exact place name takes the place) → a destination card → **Directions**
  opens From/To fields (From defaults to "Your location"; also any NPC /
  place / coords, or "Choose on map"), with Swap and "Set as my location".
  Every result row's "Directions to X" button makes that row the destination.
  - The trip lives in the URL: `to=` / `from=` = `npc:<id>` | `place:<placeId>` |
    `pt:<zone>,<x>,<y>` (no `from` = your location), `dir=1` = directions
    open. Legacy `?npc=<creature id | result id>` = `to=npc:` (the Cooking &
    Fishing trainers link with it — a test checks every trainer's id, area
    and coords against `classicServices.json`).
  - **A trip never changes the saved location** — only "Set as my location"
    does; with directions open a map click does nothing (use "Choose on map").
  - Where a place routes to: a town → its middle; a city/district → its map
    centre; a zone → its flight master for your faction, else its largest
    town, else its centre — the card says which ("Westfall has no single
    spot, so I'm routing to …").
  - The map draws A (green, start) and B (red, destination) and each leg:
    walk solid, fly dashed, boat/zeppelin/tram dotted. It fits the smallest map
    that shows the whole route (`commonMap`: an end's own map when its
    picture holds every point, else the nearest common parent).
- **"Where are you?"** (`WhereAreYou`, `worldMap/places.ts` + `where.ts`) takes a
  place ("Goldshire", "Stormwind", "sw"), the minimap's district + coords
  ("Old Town 78.4, 53.2" → the city's map), bare coords (on the zone already
  picked, with a one-click "use the city map" when a city shares that ground)
  or `/way`. Places = zones + capitals (map tree), towns (subzone centroids of
  the NPC data) and capital districts / short names from the hand-written,
  names-only `data/worldMap/placeNames.ts`. A town puts you at its middle and
  says so. Coordinates are shown only in an opened row and on the last
  directions step.
- Placement: a nested capital wins, then the flight-path name's zone, then the
  zone whose painted overlay covers the point. Classic NPCs never land on a
  Forever-only zone (`FOREVER_ONLY_ZONES`); those zones say "Not mapped yet".
- **Layers:** NPC services (`classicServices.json`), quest givers
  (`classicQuests.json` — creature/gameobject questrelation + quest_template;
  side from RequiredRaces, class quests from RequiredClasses) and dungeon/raid
  entrances (`classicDungeons.json`). Entrances come from the Classic Era
  client's AreaTrigger (the Forever client ships no dungeon triggers) joined to
  cmangos `areatrigger_teleport`; levels are Forever's own, from LFGDungeons →
  ContentTuning `MinLevelSquish`. Forever-only dungeons have no positions yet.
- Level rules (`worldMap/levels.ts`): trainers are never filtered by level;
  quests show when min level ≤ your level + 2; dungeons are coloured by the
  Classic con bands (grey/green/yellow/orange/red) and flagged "too low to
  enter" below the required level.
- Directions = travel-time search over walking, flight paths (fewest hops,
  then distance), boats/zeppelins and the Deeprun Tram (Stormwind ↔
  Ironforge — its stops are the Classic Era client's tram-entrance area
  triggers, see `travel.py`; the ride time is an estimate). "Flight paths:
  All / Only ones I know / None" (`FlightPathChoice`) limits which flight
  masters a route may use — a multi-hop flight only goes through ones you
  know, as in game; the choice and the ticked list live in
  `mga.wowForever.worldMap.travel.v1` (`hooks/useTravelSettings.ts`). Every
  flight step keeps the "flight paths must be discovered first" caveat.
- **Companion addon** `apps/mygamingassistant/addons/MGACompanion` (Interface
  16001): `/mga way <uiMapID|zone name> <x> <y> [label]` sets the in-game map
  pin. The page's "Copy in-game waypoint" buttons emit that command.
- **Captured locations (Forever ground truth):** the addon's `Capture.lua`
  records — out of combat only, never hostile units — titled NPCs you target or
  mouse over within interact range (plus what they offer: trainer, flight
  master, bank, auction house, stable, repair), quest givers you talk to (with
  their quests) and dungeon entrances you walk through, into SavedVariables
  `MGACompanionDB` (`/mga captures` shows the count). The operator imports
  `WTF\Account\<account>\SavedVariables\MGACompanion.lua` on the map page
  (signed in, full-auth mode only): it is parsed in the browser
  (`worldMap/capture/` — a data-only Lua table reader, never `eval`),
  classified into the map's service subkinds, then `POST /api/wow/map-captures`
  upserts by `capture_key` (newer `captured_at` wins). `GET` is public in both
  modes; the page merges captures over Classic rows (`applyCaptures.ts`): same
  npc id / instance id, else same name + zone; matched rows keep their Classic
  id, subkind and levels and show "Captured in Forever <date>". If the GET
  fails the page says so and shows Classic only — never localStorage.
- **Publishing captures to prod (serve-only, no import route):** locally run
  `python -m app.cli export-wow-captures` → commit
  `backend/data/wow_map_captures.json` → the deploy's `post_deploy_commands`
  run `import-wow-captures`, which mirrors the pack (a full snapshot: captures
  absent from it are deleted; an empty pack deletes nothing).

## Fixture Loading

Fixture JSON files live in `app/fixtures/`. Load them via CLI:

```bash
python -m app.cli load-fixtures
```

This is idempotent — re-running is safe (upserts by slug).

## Commands

**Backend** (from `apps/mygamingassistant/backend/`):
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --reload-dir app --port 8004
alembic upgrade head
alembic revision -m "description"
pytest

# Load fixture data
python -m app.cli load-fixtures
```

**Backend dependency management**:
```bash
uv sync                                                # first-time setup
uv add <pkg>                                           # add dep
uv export --format requirements-txt --no-hashes \
  --no-emit-project --output-file requirements.txt    # regenerate after dep changes
git add pyproject.toml uv.lock requirements.txt
```

**Frontend** (from `apps/mygamingassistant/frontend/`):
```bash
npm run dev       # Dev server on :5176 — requires backend on :8004
npm run build     # TypeScript check + Vite build
npm run typecheck
npm run lint
npm test
```

## Architecture Rules

**No register route.** `fastapi_users.get_register_router()` is never mounted.

**Seed user.** `_on_startup()` calls `seed_operator_user()` which checks for
`SEED_USER_EMAIL` + `SEED_USER_PASSWORD_HASH` in production and creates the user if
missing. If either env var is absent in production, the app refuses to start.

**Layered:**
- Routes → Services → Repositories; never import ORM/DB in route handlers
- One model per file, one schema per file

**Enums:**
- All enums are `String(N)` + `CheckConstraint("col IN (...)")` — never SQLAlchemy Enum type
- Table names are singular (`game`, `map`, `user` — matches MBK convention)

**Timestamps:**
- `DateTime(timezone=True)` on every datetime column
- `created_at` + `updated_at` with both Python and server defaults

**UUIDs:**
- `uuid.uuid4()` Python default — never `uuid-ossp` Postgres extension

## Authentication Model

MGA uses **public-read / auth-write** routing. The lineup library is publicly
browsable; mutations require operator login. This is an MGA-specific Tier 3
divergence from MBK / MJH (which remain fully auth-gated — they handle personal
financial / job-hunt data). Rationale: single-user content curation works better
as a public knowledge base — read-many, write-one.

### Backend route split

Each `app/api/*.py` module that has both reads and writes exports two routers:

```python
# Public — no auth dependency
public_router = APIRouter(prefix="/api", tags=["..."])

# Operator-only — Depends(current_active_user) at router level (NOT per-handler)
auth_router = APIRouter(
    prefix="/api",
    tags=["..."],
    dependencies=[Depends(current_active_user)],
)
```

Modules that are purely public (e.g., `games.py`) export a single `router`.
Modules that are purely operator-gated (e.g., `sources.py`, `scheduler.py`)
export a single `router` with the auth dependency at the router level.

`main.py` mounts both routers from split modules:

```python
app.include_router(lineups.public_router)
app.include_router(lineups.auth_router)
```

**Why router-level dependencies, not per-handler:** adding new auth-required
handlers cannot accidentally regress to "no auth" — the gating is declared
once on the router. This is the no-bandaid approach (see
`rules/no-bandaid-solutions.md`).

### Endpoint inventory

| Surface | Public | Auth |
|---|---|---|
| `/api/games/*` | All | — |
| `/api/lineups` (list/detail/zone-density) | GET on accepted only | non-accepted via `/api/lineups/{id}/admin` |
| `/api/lineups/*` mutations | — | All (upload-url, POST, PATCH, DELETE, classify, accept, hide, bulk-accept, pending) |
| `/api/lineup-packages` | GET + `/pin` (no server state) | POST / PATCH / DELETE |
| `/api/sources/*` | — | All |
| `/api/wow/items/extract` | POST, both modes (Claude reads an item screenshot/text; Turnstile + per-IP limit + durable daily cap; 503 `item_reader_unavailable` when unconfigured) | — |
| `/api/wow/map-captures` | GET, both modes (World Map locations captured in Forever) | POST import (full-auth only; prod gets captures via the committed pack) |
| `/api/scheduler/*` | — | All |
| `/admin/*` | — | All |
| `/users/me*` | — | All |
| `/auth/*` login/forgot/reset/verify | Yes | — |
| `/auth/jwt/logout`, TOTP setup/verify/disable/status | — | Yes |
| `/_test/*` (when `MGA_ENABLE_TEST_HELPERS=1`) | `reset-rate-limit` only | `seed-lineup` etc. |
| `/health`, `/version` | Yes | — |

The public `GET /api/lineups/{id}` returns 404 on `pending_review` or `hidden`
lineups so their presigned screenshot URLs don't leak before the operator
accepts them. The operator can still inspect any lineup via the auth-only
`/api/lineups/{id}/admin`.

### Frontend gating

The SPA loads for everyone — no global login redirect. Two gates:

- **`<AuthRequired action="...">`** wraps write-surface routes in `routes.tsx`.
  When unauthenticated, renders a centered card explaining what auth unlocks
  + a "Sign in" button that routes to `/login` carrying the current pathname
  so Login can return the user here on success.
- **`<RootLayout>`** swaps between `AppShell` (authenticated) and `GuestShell`
  (unauthenticated). The guest shell shows a "Sign in" CTA in place of the
  user dropdown and a filtered nav (only `PUBLIC_NAV_PATHS` from
  `constants/nav.ts`).

When changing the auth status of an endpoint, also update the frontend route
wrapping and the nav inclusion list — keep the backend and frontend gates
aligned so users don't see "Sign in" prompts for pages that are actually
public, or empty pages where they expected to see content.

## Deployment

**VPS path:** `/srv/myfreeapps/apps/mygamingassistant`

**Required env files (must exist on VPS before first deploy):**

| File | What it is |
|---|---|
| `apps/mygamingassistant/.env` | Compose-level — only `DB_PASSWORD` |
| `apps/mygamingassistant/backend/.env.docker` | App-level — all other secrets; see `backend/.env.docker.example` |

**Critical env vars:**

| Var | Required | Notes |
|---|---|---|
| `SEED_USER_EMAIL` | Yes (prod) | Operator login email |
| `SEED_USER_PASSWORD_HASH` | Yes (prod) | bcrypt hash — generate with `python -c "from passlib.hash import bcrypt; print(bcrypt.hash('yourpassword'))"` |
| `SECRET_KEY` | Yes | JWT signing key — generate with `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Yes | Fernet key for PII — generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DATABASE_URL` | Yes | Full async postgres URL |
| `TURNSTILE_SECRET_KEY` | Optional | Forgot-password (full-auth) + the public WoW item reader. In serve-only/production the item reader answers 503 without it (no boot guard) |
| `TURNSTILE_SITE_KEY` | Optional | Public site key. The prod bundle gets it from the GitHub Actions variable `MYGAMINGASSISTANT_VITE_TURNSTILE_SITE_KEY` (registry build), not from `.env.docker` |
| `ANTHROPIC_API_KEY` | Optional | Classifier + WoW item reader. Missing → the item reader returns 503 (no boot guard) |
| `CLAUDE_ITEM_EXTRACTOR_MODEL` | Optional | Defaults to `claude-haiku-4-5-20251001` |
| `WOW_EXTRACT_DAILY_CAP` | Optional | Global item-reader Claude calls per UTC day (DB-backed). Default 300; `0` switches the reader off |
| `ITEM_EXTRACT_RATE_LIMIT_THRESHOLD` / `_WINDOW_SECONDS` | Optional | Per-IP item-reader limit. Default 20 per 3600 s |

**After first deploy:**
```bash
# On VPS, seed fixtures
docker compose -f apps/mygamingassistant/docker-compose.yml exec api \
  python -m app.cli load-fixtures
```

**Routing:**
- Domain: `mygamingassistant.myfreeapps.org`
- Host Caddy proxies to docker Caddy on `127.0.0.1:8096`
- Docker Caddy owns `/api/*` → backend proxy, SPA fallback, security headers

**Health check:**
```bash
curl http://127.0.0.1:8096/health
```

## Phase Plan

- **Phase 1 (current):** Scaffold — auth, domain models, fixture data, stub API routes, frontend stubs
- **Phase 2:** Full lineup CRUD — upload screenshots, position sources on minimap, annotate
- **Phase 3:** Lineup viewer — overlay on minimap canvas, filter by utility/site/zone
- **Phase 4:** Packages — group lineups into named sets, share/export
- **Phase 5:** AI suggestions — generate lineup descriptions with Claude
- **Phase 6:** Multi-game analytics — compare lineup coverage across maps
- **Phase 7:** Desktop shell — Tauri wrapper for native-app feel

## Tech Debt Policy

mode: no-growth on flagged files

A PR MAY NOT increase the LOC count of any file currently listed under
`scripts/file-size-allowlist.yml` `over_1000_loc` OR any source file already
over 500 LOC. If a PR genuinely needs to add to a flagged file, the same PR
MUST split that file (extract a sibling module + re-export from the original)
in the same commit. The CI check at `.github/workflows/file-size-check.yml`
enforces this.

Critical severity items that directly block the current feature can still be
fixed inline. Everything else logged in `TECH_DEBT.md` and addressed in
dedicated refactor PRs.
