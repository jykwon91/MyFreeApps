# MyGamingAssistant — CLAUDE.md

## Project

**MyGamingAssistant** — a single-user, self-hosted lineup and utility management tool
for tactical FPS games (Valorant, CS2). Core value: store and visualize lineup throws
overlaid on game minimaps. Part of the MyFreeApps monorepo.

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
- `game` — slug + name + side labels (attacker/defender or T/CT)
- `map` — belongs to game; slug + name + minimap URL
- `map_zone` — polygon overlay zones on a map (A main, B site, etc.)
- `site` — bomb sites / objective sites on a map
- `utility_type` — per-game utility types (smoke, flash, molotov, recon, etc.)

### Lineup domain
- `source` — a throwing position on a map for a utility
- `lineup` — A → B trajectory (source + destination zone/site, side, description)
- `lineup_package` — named collection of lineups
- `lineup_package_lineup` — M2M join

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
| `TURNSTILE_SECRET_KEY` | Optional | MGA has no public registration; Turnstile is only on forgot-password |

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
