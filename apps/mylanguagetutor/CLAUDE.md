# MyLanguageTutor -- CLAUDE.md

## Project

**MyLanguageTutor** -- multi-user, voice-first AI language tutor on the MyFreeApps
platform. Learners pick a scenario (ordering at a cafe, asking directions, ...)
and hold a spoken conversation with an AI tutor that replies in the target
language and gently corrects mistakes.

**Multi-user app:** public self-serve registration (`/auth/register`, Turnstile +
per-IP rate limit, email verification required before login). A platform admin
is seeded at boot from `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD_HASH`. The
backend auth shell mirrors `apps/myrecipes` (the most recent multi-user app).

## Domain

Registries in `backend/app/domain/` are the single source of truth; the DB
CHECK constraints and the API validation derive from them.

| Registry | Values |
|---|---|
| `languages/` (`LanguageConfig`, frozen) | `es` -- Spanish, Latin American, STT/TTS locale `es-MX` |
| `levels.py` | `beginner`, `some_phrases`, `conversational` |
| `scenarios/` (`Scenario(slug, title, goal, goals, order)`) | greetings, repair-phrases, about-me, cafe, paying, directions, likes-weekend, appointment, free-talk (order 1-9) |
| `session_status.py` / `turn_status.py` | session `active` / `ended`; turn `complete` / `partial` / `failed` |

Tables:
- `tutor_session` -- one practice conversation (user, language, scenario,
  level, status, turn_count, created/updated/ended timestamps).
- `tutor_turn` -- one learner utterance + tutor reply, ordered by `seq`
  (unique per session). Transcript columns (`learner_text`, `reply_text`,
  `corrections_json`, `translation_text`) are `EncryptedString` + `key_version`.
- `tutor_profile` -- one row per learner: onboarding language + level.
- `daily_usage_counters` -- the shared per-user daily quota table (same shape
  as MGA's). Buckets `ltutor:user:<id>` and `ltutor:global` hold cost units.

Every tutor table carries `user_id` FK -> `users.id` `ON DELETE CASCADE`, so
account deletion removes all tutor data. Repositories filter by `user_id` on
every read; another user's session is a 404. `build_export` includes every
session with its turns. **Never log transcript text** -- log ids only.

API (router prefixes are resource names, never `/api`; all require a verified
user at the router level): `GET /languages`, `GET /scenarios?language=es`,
`POST /sessions`, `GET /sessions` (paginated, newest first),
`GET /sessions/{id}` (turns by seq), `POST /sessions/{id}/end`,
`DELETE /sessions/{id}`, `GET|PUT /profile` (`null` before onboarding),
`GET /usage/today` (caller's remaining fraction only),
`POST /sessions/{id}/turns` (SSE).

## Conversation loop

`POST /sessions/{id}/turns` streams SSE events in this order:
`turn.started`, `reply.delta`*, `reply.done`, `corrections`, `done`
(or `error` then `done` on a mid-stream failure). Pre-stream refusals are
plain HTTP errors: 404 `session_not_found`, 409 `session_ended` /
`session_turn_limit`, 429 `daily_limit_reached` / `turn_in_progress` /
burst limiter, 503 `tutor_unavailable` (global cap, kill switch, or no key).

- **Three Claude calls per turn.** Reply (Haiku, streamed) and corrections
  (Sonnet, JSON) run in parallel; the translation (Haiku) runs after
  `reply.done` and rides the `corrections` event. Model ids come from
  Settings (`LTUTOR_*_MODEL`) -- never hardcode them in services.
- **Cost caps.** Every turn reserves an upper-bound estimate in cost units
  (see `core/config.py`) against the per-user and global daily buckets, then
  reconciles to actual usage. `LTUTOR_GLOBAL_DAILY_UNITS=0` is the kill switch.
  One turn in flight per user (`services/tutor/turn_slots.py`).
- **Frontend.** Speech recognition and TTS are the browser's Web Speech API
  (no audio reaches our servers). The SSE body is read with `fetch` +
  `eventsource-parser` (`features/tutor-stream/`) because `EventSource` can't
  POST or send a bearer token. Replies are spoken sentence by sentence
  (`features/speech/sentenceChunker.ts`). Browsers without recognition
  (Firefox) get labelled typed practice.
- **Copy rules.** No pronunciation scoring, no "fluent", no "native speaker",
  no streak guilt. Corrections are hedged ("It looked like you said...")
  because the transcript may be a mishearing.

**Adding a language / scenario / level** requires an alembic migration that
rewrites the matching CHECK constraint (the migration freezes literal value
lists). `tests/test_domain_registries.py` fails CI -- against both the models
and the migrated database -- if a registry drifts from its constraint.

## Canonical App

**MyBookkeeper is the canonical app.** MyLanguageTutor mirrors MBK for all Tier-1
and Tier-2 infrastructure byte-for-byte (auth, security, Docker, Caddy, deploy workflow)
except for:
- App name, ports, and domain
- Multi-user auth shell (register router + seeded admin), mirrored from MyRecipes
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
apps/mylanguagetutor/
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
| Caddy (docker) | 8102 (host) -> :80 (container) |
| Backend (uvicorn) | 8010 |
| Frontend (dev) | 5182 |
| PostgreSQL (dev) | see docker-compose.yml |

Domain: `mylanguagetutor.myfreeapps.org`

## Commands

**Backend** (from `apps/mylanguagetutor/backend/`):
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --reload-dir app --port 8010
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

**Frontend** (from `apps/mylanguagetutor/frontend/`):
```bash
npm run dev       # Dev server on :5182 -- requires backend on :8010
npm run build     # TypeScript check + Vite build
npm run typecheck
npm run lint
npm test
```

## Architecture Rules

**Register route.** `fastapi_users.get_register_router()` is mounted behind
`check_register_rate_limit` + `require_turnstile` (see `app/main.py`).

**Seed admin.** The lifespan runs the shared `build_seed_admin_hook`, which
creates the platform admin from `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD_HASH`
when set.

**Layered:**
- Routes -> Services -> Repositories; never import ORM/DB in route handlers
- One model per file, one schema per file

**Enums:**
- App domain enums are `String(N)` + `CheckConstraint("col IN (...)")` -- never SQLAlchemy Enum type
- Exception: the platform `user.role` column uses the postgres `user_role` ENUM
  (the shared User model binds `SAEnum(Role, name="user_role")`); migration `0001`
  creates the type. Don't model `user.role` as `String` -- that mismatches the model
  and the app fails the first auth INSERT with `type "user_role" does not exist`.
- The auth table is the plural `users` (multi-user; matches MyBookkeeper,
  MyJobHunter, MyRecipes and the shared register test factory's raw SQL).
  App tables are singular (`tutor_session`, `tutor_turn`).

**Timestamps:**
- `DateTime(timezone=True)` on every datetime column
- `created_at` + `updated_at` with both Python and server defaults

**UUIDs:**
- `uuid.uuid4()` Python default -- never `uuid-ossp` Postgres extension

## Deployment

**VPS path:** `/srv/myfreeapps/apps/mylanguagetutor`

**Required env files (must exist on VPS before first deploy):**

| File | What it is |
|---|---|
| `apps/mylanguagetutor/.env` | Compose-level -- only `DB_PASSWORD` |
| `apps/mylanguagetutor/backend/.env.docker` | App-level -- all other secrets; see `backend/.env.docker.example` |

Seed both in one shot on the VPS -- secrets are auto-generated, deploy values
stamped, and the command prints a checklist of operator-external values
(Sentry DSN, SMTP, Turnstile) to fill in. Re-run with `--check` to verify:

```bash
cd /srv/myfreeapps
PYTHONPATH=packages/shared-backend python3 -m platform_shared.infra.seed_env --app mylanguagetutor
```

No-SSH alternative: set the per-app repo secrets (slug uppercased +
`_SENTRY_DSN`, `_SMTP_USER`, `_SMTP_PASSWORD`, `_EMAIL_FROM_ADDRESS`,
`_TURNSTILE_SECRET_KEY`, `_MINIO_ACCESS_KEY`, `_MINIO_SECRET_KEY`,
`_SEED_ADMIN_EMAIL` + `_SEED_ADMIN_PASSWORD_HASH`) via `gh secret set`,
then dispatch the "Seed VPS env files" workflow:
`gh workflow run seed-env.yml -f app=mylanguagetutor`.

**Critical env vars:**

| Var | Required | Notes |
|---|---|---|
| `SEED_ADMIN_EMAIL` | Recommended | Platform-admin login email (seeded at boot) |
| `SEED_ADMIN_PASSWORD_HASH` | With the email | bcrypt hash -- generate locally, never paste the password anywhere |
| `SECRET_KEY` | Yes | JWT signing key -- generate with `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Yes | Fernet key for PII -- generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DATABASE_URL` | Yes | Full async postgres URL |
| `TURNSTILE_SECRET_KEY` | Yes (prod) | Protects /auth/register + /forgot-password; the frontend needs the matching site key at BUILD time |
| `ANTHROPIC_API_KEY` | Yes (prod) | The tutor. The lifespan boot guard refuses to start in production without it. Also set a ~$20/mo spend limit in the Anthropic console |
| `LTUTOR_REPLY_MODEL` / `LTUTOR_CORRECTIONS_MODEL` / `LTUTOR_TRANSLATION_MODEL` | No | Defaults `claude-haiku-4-5` / `claude-sonnet-5` / `claude-haiku-4-5` |
| `LTUTOR_USER_DAILY_UNITS` / `LTUTOR_GLOBAL_DAILY_UNITS` | No | Daily cost caps (defaults 250000 / 650000 ~= $0.25 / $0.65). Global `0` = kill switch |
| `LTUTOR_CORRECTIONS_UNIT_WEIGHT` | No | Sonnet price relative to Haiku (default 2.0) |

**Routing:**
- Domain: `mylanguagetutor.myfreeapps.org`
- Host Caddy proxies to docker Caddy on `127.0.0.1:8102`
- Docker Caddy owns `/api/*` -> backend proxy, SPA fallback, security headers

**Deploys are automatic** on push to main (`automated_deploy: true` in
`app.yaml`) since the conversation loop shipped.

**Microphone.** `permissions_policy_self: [microphone]` in `app.yaml` renders
`microphone=(self)` into the Caddy `Permissions-Policy` header -- the voice UI
needs it. Edit `app.yaml` and re-render; never hand-edit the Caddyfile.

**Health check:**
```bash
curl http://127.0.0.1:8102/health
```

## Tech Debt Policy

mode: log-only

New project. Fix only Critical severity items that directly block the current
feature. Log everything else in TECH_DEBT.md.
