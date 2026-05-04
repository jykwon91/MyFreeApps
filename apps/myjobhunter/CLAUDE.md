# MyJobHunter — CLAUDE.md

## Project

**MyJobHunter** — a job hunt tracker with AI-powered document processing.
Core value: extract structured data from job descriptions, tailor resumes to JDs,
research companies, and track application pipelines. Part of the MyFreeApps monorepo.

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI, Python 3.12, SQLAlchemy 2.0 (async), PostgreSQL 16, Alembic, Pydantic 2 |
| Auth | fastapi-users, JWT Bearer |
| AI | Anthropic Claude SDK (Phase 2+) |
| Research | Tavily API (Phase 2+) |
| Background jobs | Dramatiq (Phase 3+) |
| Shared infra | `packages/shared-backend/platform_shared` |

## Directory Map

```
apps/myjobhunter/
├── backend/
│   ├── alembic/               DB migrations
│   ├── app/
│   │   ├── api/               Flat route handlers (thin — delegate to services)
│   │   ├── core/              Config, auth, enums, security, screening_questions
│   │   ├── db/                Session factory + Base (re-exports from platform_shared)
│   │   ├── models/            Domain-per-directory ORM models
│   │   ├── schemas/           Domain-per-directory Pydantic schemas
│   │   ├── repositories/      Domain-per-directory data access layer
│   │   ├── services/          Domain-per-directory business logic
│   │   └── mappers/           Data transformation (model → schema)
│   └── tests/
├── docker/
├── docker-compose.yml         (prod)
└── docker-compose.dev.yml     (dev — hot reload)
```

## Data Model (15 tables)

### Profile domain
- `profiles` — 1:1 with users; resume metadata, salary prefs, locations, TOTP fields
- `work_history` — past roles with bullet arrays
- `education` — degrees, years, GPA
- `skills` — name + years_experience + category; UNIQUE(user_id, lower(name))
- `screening_answers` — pre-fill answers for job applications; UNIQUE(user_id, question_key)

### Company domain
- `companies` — per-user company records; UNIQUE(user_id, lower(primary_domain))
- `company_research` — 1:1 with companies; AI-synthesized research (sentiment, comp, flags)
- `research_sources` — individual web sources backing a research record

### Application domain
- `applications` — job applications; soft-delete via deleted_at; NO latest_status column
- `application_events` — event log (applied, interview, offer, etc.); dedup on email_message_id
- `application_contacts` — people associated with an application (recruiter, HM, etc.)
- `documents` — cover letters, tailored resumes, etc.; soft-delete via deleted_at

### Integration domain
- `job_board_credentials` — encrypted credentials for LinkedIn, Indeed, etc.; UNIQUE(user_id, board)

### Jobs domain
- `resume_upload_jobs` — async parse job status (Dramatiq worker in Phase 3)

### System domain
- `extraction_logs` — token + cost accounting for Claude/Tavily calls

## Architecture Rules

**Layered:**
- Routes → Services → Repositories; never import ORM/DB in route handlers
- One model per file, one schema per file
- Mappers convert model → schema; services orchestrate

**Enums:**
- All enums are `String(N)` + `CheckConstraint("col IN (...)")` — never SQLAlchemy Enum type
- Canonical values live in `app/core/enums.py`

**Tenant isolation:**
- Every row has `user_id FK users(id) CASCADE, indexed`
- Every query filters by `user_id` — never leak data across users
- `user_id` scoping is mandatory in all repository functions

**No latest_status column:**
- Application status is computed via lateral join on `application_events(application_id, occurred_at DESC)`
- Covering index `ix_appevent_app_occurred` exists for this query

**Soft delete:**
- Only `applications` and `documents` have `deleted_at`
- Companies use hard delete

**Timestamps:**
- `DateTime(timezone=True)` on every datetime column
- `created_at` + `updated_at` on every table (except `application_events` and `research_sources` which are immutable — created_at only)
- Python `default=lambda: datetime.now(timezone.utc)` + `server_default=func.now()`

**UUIDs:**
- `uuid.uuid4()` Python default — never `uuid-ossp` Postgres extension

## Screening Questions

`app/core/screening_questions.py` defines `ALLOWED_KEYS` and `EEOC_KEYS`.
At write time, `is_eeoc` is derived from `is_eeoc(question_key)` — never set by the caller.

## Port Offsets (Docker dev)

| App | Backend | Postgres | Caddy |
|---|---|---|---|
| MyBookkeeper | :8000 | :5432 | — |
| MyRestaurantReviews | :8001 | :5433 | :5174 |
| MyJobHunter | :8002 | :5434 | :5175 |

## Commands

**Backend** (run from `apps/myjobhunter/backend/`):
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --reload-dir app    # API on :8002
alembic upgrade head                              # Apply migrations
alembic revision -m "description"                # New migration
pytest                                            # Run all tests
```

**Backend dependency management** (run from `apps/myjobhunter/backend/`):

The source of truth is `pyproject.toml` (top-level deps) locked into `uv.lock` (full transitive closure). `requirements.txt` is a machine-generated compatibility export consumed by Docker/CI/deploy scripts — never hand-edit it.

```bash
# First-time setup (creates backend/.venv from the lockfile)
uv sync

# Add / remove / bump a dependency
uv add <pkg>                          # adds to pyproject.toml and uv.lock
uv remove <pkg>                       # removes from pyproject.toml and uv.lock
uv lock --upgrade-package <pkg>       # bump a single pinned dep

# Regenerate requirements.txt after any dep change
uv export --format requirements-txt --no-hashes --no-emit-project \
  --output-file requirements.txt

# Commit all three files together
git add pyproject.toml uv.lock requirements.txt

# Verify the lockfile is consistent (runs in CI too)
uv lock --check
```

## Testing

- `pytest` with `asyncio_mode = auto`
- `conftest.py` provides: `db`, `client`, `user_factory`, `as_user`
- Every test uses a rolled-back transaction for isolation
- Hard-delete users in teardown to prevent cross-session contamination
- Tenant isolation tests in `test_tenant_isolation.py`

## Deployment

**VPS path:** `/srv/myfreeapps/apps/myjobhunter`

**Required env files (must exist on VPS before first deploy):**

| File | What it is |
|---|---|
| `apps/myjobhunter/.env` | Compose-level — only `DB_PASSWORD` |
| `apps/myjobhunter/backend/.env.docker` | App-level — all other secrets; see `backend/.env.docker.example` |

**First-time setup** (new VPS only — run once from `/srv/myfreeapps`):
```bash
sudo bash apps/myjobhunter/scripts/seed-env-from-mbk.sh
# Then fill in the MJH-specific blanks:
vim apps/myjobhunter/backend/.env.docker
# Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY
# Optional: TAVILY_API_KEY (Phase 4), SMTP_* (currently uses console backend)
```

The seed script reads safe-to-reuse keys from MBK's running config (Anthropic API key, lockout
tunables, log level) and generates fresh secrets for per-app values (SECRET_KEY, ENCRYPTION_KEY,
DB_PASSWORD). FRONTEND_URL and CORS_ORIGINS are pre-filled with the sslip.io domain.

**Day-to-day deploys:** Push to main or merge a PR — GitHub Actions deploys automatically.

**Routing:**
- Domain: `myjobhunter.165-245-134-251.sslip.io`
- Host Caddy (TLS termination at `/etc/caddy/Caddyfile`) proxies to docker Caddy on `127.0.0.1:8092`
- Docker Caddy (baked into caddy image) owns routing, security headers, CSP, SPA fallback, and `/api/*` → backend proxy

**Health check:**
```bash
curl http://127.0.0.1:8092/health    # from VPS (bypasses host Caddy)
curl https://myjobhunter.165-245-134-251.sslip.io/health  # public
```

**Database backup/restore:**
MJH does not yet have automated backup scripts (MBK has `deploy/backup.sh` + systemd timer;
MJH should mirror this — see TECH_DEBT.md). For now, manual backup:
```bash
# On VPS:
docker compose -f apps/myjobhunter/docker-compose.yml exec postgres \
  pg_dump -U myjobhunter myjobhunter | gzip > /tmp/mjh-$(date +%Y%m%d).sql.gz
```

**When to SSH into the server:**
- First-time env file setup (seed-env-from-mbk.sh)
- Restore from backup
- Check logs: `docker compose -f apps/myjobhunter/docker-compose.yml logs api --tail=50`
- Debug production issues

## Phase 1 Scope

**Implemented:** models, migrations, auth endpoints, 6 smoke read endpoints, tests, Docker, CI, HIBP password-breach check at registration / reset (`platform_shared.services.hibp_service`, fail-open on outage), TOTP 2FA enrollment + login challenge + disable + status (`backend/app/api/totp.py`, frontend `features/security/TwoFactorSetup.tsx`)
**Phase 2:** Full CRUD for all domains, file upload, resume parse trigger
**Phase 3:** Dramatiq workers, Gmail OAuth, Chrome extension integration
**Phase 4:** Tavily company research, Claude JD parsing, cover letter generation

## Known Follow-ups

- GIN indexes on JSONB columns (add when actual query predicates exist)
