# MyRecipes -- CLAUDE.md

## Project

**MyRecipes** -- a multi-user recipe app on the MyFreeApps platform. The core
idea is **version control for cooking**: you save a recipe, then every tweak
creates a new immutable *version*. The app shows the version timeline, the
*diff* between any two versions, and *cook logs* (a rating + notes each time you
cook a version) so you can converge on your best result.

**Multi-user app:** public registration is enabled (`POST /auth/register`),
mirroring the canonical app MyBookkeeper. New accounts verify their email before
first login, and every recipe row is scoped per-user (`user_id` FK with
`ON DELETE CASCADE`).

> Note: this app was scaffolded from the shared single-user template
> (`infra/templates/scaffold`, via `python -m platform_shared.infra.new_app`)
> and then converted to multi-user — the register router was mounted and the
> seed-user path removed. See `backend/app/main.py`.

## Canonical App

**MyBookkeeper is the canonical app.** MyRecipes mirrors MBK for all Tier-1 and
Tier-2 infrastructure byte-for-byte (auth, security, Docker, Caddy, deploy
workflow) except for:
- App name, ports, and domain
- App-specific domain models (the recipe/version/ingredient/step/cook-log model)

Before adding any infrastructure feature, open the matching MBK file first.

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI, Python 3.12, SQLAlchemy 2.0 (async), PostgreSQL 16, Alembic, Pydantic 2 |
| Auth | fastapi-users, JWT Bearer (register + login + TOTP + lockout + HIBP + Turnstile, all from platform_shared) |
| Frontend | React 19, Vite, TypeScript, Tailwind, Redux Toolkit + RTK Query, @platform/ui |
| Shared infra | `packages/shared-backend/platform_shared`, `packages/shared-frontend/@platform/ui` |

## Domain model (Tier 3)

```
recipe              one per user-owned recipe; soft-deleted (deleted_at)
  └─ recipe_version immutable snapshot per tweak; version_number 1..N;
                    parent_version_id = lineage; "current" = highest number
       ├─ recipe_ingredient  snapshot rows; lineage_key stable across versions
       │                     so diffs read "salt 1 tsp -> 2 tsp" as a change
       └─ recipe_step        snapshot rows; matched by position for diffs
  └─ cook_log       a cook of one version: cooked_at + rating(1-5) + notes
```

- A **tweak** = `POST /recipes/{id}/versions`: copies a base version forward,
  applies edits, bumps `version_number`. Carry each ingredient's `lineage_key`
  from the base so the diff engine tracks changes vs. add/remove.
- **Restore** copies an old version forward as a new latest version — history
  is never rewritten.
- The pure diff engine lives in `services/recipe/version_diff.py`.

## Port Assignments

| Service | Port |
|---|---|
| Caddy (docker) | 8100 (host) -> :80 (container) |
| Backend (uvicorn) | 8008 |
| Frontend (dev) | 5180 |

Domain: `myrecipes.myfreeapps.org`

## Commands

**Backend** (from `apps/myrecipes/backend/`):
```bash
uv sync
uv run uvicorn app.main:app --reload --reload-dir app --port 8008
uv run alembic upgrade head
uv run alembic revision -m "description"
uv run pytest
# regenerate requirements.txt after any dep change:
uv export --format requirements-txt --no-hashes --no-emit-project --output-file requirements.txt
git add pyproject.toml uv.lock requirements.txt
```

**Frontend** (from monorepo root, or `apps/myrecipes/frontend/`):
```bash
npm run dev --workspace=apps/myrecipes/frontend       # :5180 -- requires backend on :8008
npm run build --workspace=apps/myrecipes/frontend
npm run typecheck --workspace=apps/myrecipes/frontend
npm run lint --workspace=apps/myrecipes/frontend
npm test --workspace=apps/myrecipes/frontend
```

## Architecture Rules

**Registration enabled.** `fastapi_users.get_register_router()` is mounted in
`main.py` with a per-IP register throttle (`check_register_rate_limit`) +
Turnstile (`require_turnstile`, a no-op when the secret is empty in dev/CI).

**Layered:** Routes -> Services -> Repositories; never import ORM/DB in route
handlers or services (services call repos). Mappers convert ORM -> Pydantic.

**Tenant isolation:** every repo query filters by `user_id`; cross-tenant
access returns 404 (no existence leak). `recipe`, `recipe_version`, and
`cook_log` carry a `user_id` FK with `ON DELETE CASCADE`.

**Enums:** `String(N)` + `CheckConstraint`, never SQLAlchemy `Enum`. Table
names singular.

**Timestamps:** `DateTime(timezone=True)` with Python + server defaults on
`created_at`/`updated_at`.

**UUIDs:** `uuid.uuid4()` Python default + `gen_random_uuid()` server default.

## Deployment

**VPS path:** `/srv/myfreeapps/apps/myrecipes`

**Required env files (must exist on the VPS before first deploy):**

| File | What it is |
|---|---|
| `apps/myrecipes/.env` | Compose-level -- only `DB_PASSWORD` |
| `apps/myrecipes/backend/.env.docker` | App-level -- all other secrets; see `backend/.env.docker.example` |

**Critical env vars:**

| Var | Required | Notes |
|---|---|---|
| `SECRET_KEY` | Yes | JWT signing -- `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Yes | Fernet PII key -- `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DATABASE_URL` | Yes | Full async postgres URL (set by docker-compose) |
| `SENTRY_DSN` | Yes (prod) | Boot fails loud if missing in production |
| `EMAIL_BACKEND` + SMTP_* | Yes (prod) | Verification + reset emails; `console` only in dev/CI |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Recommended (prod) | CAPTCHA on register + forgot-password; site key is a build arg baked into the bundle |

**Routing:**
- Domain: `myrecipes.myfreeapps.org`
- Host Caddy proxies to docker Caddy on `127.0.0.1:8100`
- Docker Caddy owns `/api/*` -> backend proxy, SPA fallback, security headers

**Health check:** `curl http://127.0.0.1:8100/health`

## Tech Debt Policy

mode: log-only

New project. Fix only Critical severity items that directly block the current
feature. Log everything else in a project `TECH_DEBT.md`.
