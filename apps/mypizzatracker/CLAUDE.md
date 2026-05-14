# MyPizzaTracker -- CLAUDE.md

## Project

**MyPizzaTracker** -- single-user, self-hosted app on the MyFreeApps platform.

**Single-user app:** There is NO `/register` route. The operator account is seeded at
boot time from `SEED_USER_EMAIL` + `SEED_USER_PASSWORD_HASH` env vars. Production boot
fails loudly if those vars are missing.

## Canonical App

**MyBookkeeper is the canonical app.** MyPizzaTracker mirrors MBK for all Tier-1
and Tier-2 infrastructure byte-for-byte (auth, security, Docker, Caddy, deploy workflow)
except for:
- App name, ports, and domain
- Single-user design (no /register route, seed user from env)
- App-specific domain models

Before adding any infrastructure feature, open the matching MBK file first.

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI, Python 3.12, SQLAlchemy 2.0 (async), PostgreSQL 16, Alembic, Pydantic 2 |
| Auth | fastapi-users, JWT Bearer |
| Frontend | React 19, Vite, TypeScript, Tailwind, @platform/ui |
| Shared infra | `packages/shared-backend/platform_shared`, `packages/shared-frontend/@platform/ui` |

## Directory Map

```
apps/mypizzatracker/
|-- backend/
|   |-- alembic/               DB migrations
|   |-- app/
|   |   |-- api/               Flat route handlers (thin -- delegate to services)
|   |   |-- cli/               CLI entrypoint -- python -m app.cli <command>
|   |   |-- core/              Config, auth, security, permissions
|   |   |-- db/                Session factory + Base (re-exports from platform_shared)
|   |   |-- models/            Domain-per-directory ORM models
|   |   |-- schemas/           Domain-per-directory Pydantic schemas
|   |   `-- services/          Business logic services
|   `-- tests/
|-- docker/
|-- docker-compose.yml
`-- CLAUDE.md
```

## Port Assignments

| Service | Port |
|---|---|
| Caddy (docker) | 8098 (host) -> :80 (container) |
| Backend (uvicorn) | 8006 |
| Frontend (dev) | 5178 |
| PostgreSQL (dev) | see docker-compose.yml |

Domain: `mypizzatracker.myfreeapps.org`

## Commands

**Backend** (from `apps/mypizzatracker/backend/`):
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --reload-dir app --port 8006
alembic upgrade head
alembic revision -m "description"
pytest
```

**Backend dependency management**:
```bash
uv sync                                                # first-time setup
uv add <pkg>                                           # add dep
uv export --format requirements-txt --no-hashes \
  --no-emit-project --output-file requirements.txt    # regenerate after dep changes
git add pyproject.toml uv.lock requirements.txt
```

**Frontend** (from `apps/mypizzatracker/frontend/`):
```bash
npm run dev       # Dev server on :5178 -- requires backend on :8006
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
- Routes -> Services -> Repositories; never import ORM/DB in route handlers
- One model per file, one schema per file

**Enums:**
- All enums are `String(N)` + `CheckConstraint("col IN (...)")` -- never SQLAlchemy Enum type
- Table names are singular (`user`, etc. -- matches MBK convention)

**Timestamps:**
- `DateTime(timezone=True)` on every datetime column
- `created_at` + `updated_at` with both Python and server defaults

**UUIDs:**
- `uuid.uuid4()` Python default -- never `uuid-ossp` Postgres extension

## Deployment

**VPS path:** `/srv/myfreeapps/apps/mypizzatracker`

**Required env files (must exist on VPS before first deploy):**

| File | What it is |
|---|---|
| `apps/mypizzatracker/.env` | Compose-level -- only `DB_PASSWORD` |
| `apps/mypizzatracker/backend/.env.docker` | App-level -- all other secrets; see `backend/.env.docker.example` |

**Critical env vars:**

| Var | Required | Notes |
|---|---|---|
| `SEED_USER_EMAIL` | Yes (prod) | Operator login email |
| `SEED_USER_PASSWORD_HASH` | Yes (prod) | bcrypt hash -- generate with `python -c "from passlib.hash import bcrypt; print(bcrypt.hash('yourpassword'))"` |
| `SECRET_KEY` | Yes | JWT signing key -- generate with `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Yes | Fernet key for PII -- generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DATABASE_URL` | Yes | Full async postgres URL |
| `TURNSTILE_SECRET_KEY` | Optional | Only needed if /forgot-password Turnstile is enabled |

**Routing:**
- Domain: `mypizzatracker.myfreeapps.org`
- Host Caddy proxies to docker Caddy on `127.0.0.1:8098`
- Docker Caddy owns `/api/*` -> backend proxy, SPA fallback, security headers

**Health check:**
```bash
curl http://127.0.0.1:8098/health
```

## Tech Debt Policy

mode: log-only

New project. Fix only Critical severity items that directly block the current
feature. Log everything else in TECH_DEBT.md.
