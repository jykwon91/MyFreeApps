# __APP_DISPLAY_NAME__ -- CLAUDE.md

## Project

**__APP_DISPLAY_NAME__** -- single-user, self-hosted app on the MyFreeApps platform.

**Single-user app:** There is NO `/register` route. The operator account is seeded at
boot time from `SEED_USER_EMAIL` + `SEED_USER_PASSWORD_HASH` env vars. Production boot
fails loudly if those vars are missing.

## Canonical App

**MyBookkeeper is the canonical app.** __APP_DISPLAY_NAME__ mirrors MBK for all Tier-1
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
apps/__APP_SLUG__/
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
| Caddy (docker) | __CADDY_HOST_PORT__ (host) -> :80 (container) |
| Backend (uvicorn) | __API_PORT__ |
| Frontend (dev) | __FRONTEND_DEV_PORT__ |
| PostgreSQL (dev) | see docker-compose.yml |

Domain: `__APP_SLUG__.myfreeapps.org`

## Commands

**Backend** (from `apps/__APP_SLUG__/backend/`):
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --reload-dir app --port __API_PORT__
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

**Frontend** (from `apps/__APP_SLUG__/frontend/`):
```bash
npm run dev       # Dev server on :__FRONTEND_DEV_PORT__ -- requires backend on :__API_PORT__
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
- App domain enums are `String(N)` + `CheckConstraint("col IN (...)")` -- never SQLAlchemy Enum type
- Exception: the platform `user.role` column uses the postgres `user_role` ENUM
  (the shared User model binds `SAEnum(Role, name="user_role")`); migration `0001`
  creates the type. Don't model `user.role` as `String` -- that mismatches the model
  and the app fails the first auth INSERT with `type "user_role" does not exist`.
- Table names are singular (`user`, etc.). Multi-user apps that mount the register
  router use the plural `users` (matches MyBookkeeper + MyJobHunter + the shared
  register test factory's raw SQL); rename the table when converting to multi-user.

**Timestamps:**
- `DateTime(timezone=True)` on every datetime column
- `created_at` + `updated_at` with both Python and server defaults

**UUIDs:**
- `uuid.uuid4()` Python default -- never `uuid-ossp` Postgres extension

## Deployment

**VPS path:** `/srv/myfreeapps/apps/__APP_SLUG__`

**Required env files (must exist on VPS before first deploy):**

| File | What it is |
|---|---|
| `apps/__APP_SLUG__/.env` | Compose-level -- only `DB_PASSWORD` |
| `apps/__APP_SLUG__/backend/.env.docker` | App-level -- all other secrets; see `backend/.env.docker.example` |

Seed both in one shot on the VPS -- secrets are auto-generated, deploy values
stamped, and the command prints a checklist of operator-external values
(Sentry DSN, SMTP, Turnstile) to fill in. Re-run with `--check` to verify:

```bash
cd /srv/myfreeapps
PYTHONPATH=packages/shared-backend python3 -m platform_shared.infra.seed_env --app __APP_SLUG__
```

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
- Domain: `__APP_SLUG__.myfreeapps.org`
- Host Caddy proxies to docker Caddy on `127.0.0.1:__CADDY_HOST_PORT__`
- Docker Caddy owns `/api/*` -> backend proxy, SPA fallback, security headers

**Health check:**
```bash
curl http://127.0.0.1:__CADDY_HOST_PORT__/health
```

## Tech Debt Policy

mode: log-only

New project. Fix only Critical severity items that directly block the current
feature. Log everything else in TECH_DEBT.md.
