# MyBookkeeper

A personal bookkeeping app for rental property owners, built around AI-powered
document extraction. Upload an invoice, receipt, lease, 1099, or bank
statement — or connect a Gmail inbox — and the app pulls out structured
financial data, categorizes it, and maps it to the right tax line.

This is a public snapshot of a private project, shared as a code sample.

## What it does

- **Document extraction.** PDFs, images, spreadsheets, DOCX, and emails are
  parsed with a combination of native libraries (pypdf, mammoth, openpyxl)
  and Claude vision. The extractor falls back to vision when text extraction
  yields nothing.
- **Gmail integration.** A scheduled worker polls connected inboxes every 15
  minutes, deduplicates on message ID, and pushes new attachments through the
  same extraction pipeline as manual uploads.
- **Tax-aware categorization.** Transactions are mapped to Schedule E line
  items, with depreciation and capital-vs-operating expense tracking.
- **Reconciliation.** Compares extracted transactions against bank CSVs and
  surfaces duplicates or missing entries.
- **Dashboard.** Monthly revenue / expense / profit aggregates with
  drill-down, per-property breakdown, and date-range filtering.
- **Multi-org.** Users can belong to multiple organizations (e.g. personal +
  an LLC) with role-based access.
- **Admin portal.** System health, cost monitoring (token spend per user),
  user activity, demo seed data.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, Redux Toolkit (RTK Query), React Hook Form, Recharts, Radix UI |
| Backend | FastAPI, Python 3.12, SQLAlchemy 2.0 (async), PostgreSQL, Alembic, Pydantic 2 |
| Auth | fastapi-users, JWT, optional TOTP 2FA |
| AI | Anthropic Claude SDK (Opus / Sonnet) |
| Background jobs | Dramatiq with a PostgreSQL broker |
| Testing | Vitest + React Testing Library, Playwright, pytest + pytest-asyncio |
| Deploy | Docker Compose, Caddy reverse proxy, GitHub Actions → VPS |
| PWA | `vite-plugin-pwa` with offline-first caching (API routes explicitly denylisted) |

## Architecture highlights

**Layered architecture, enforced.** Route handlers are thin; services
orchestrate; repositories own all SQL; mappers convert raw extraction output
into ORM models. Route handlers never import SQLAlchemy directly.

```
api/        → services/   → repositories/  → db
            ↘ mappers/    ↗
```

**Idempotent, dedup-aware ingestion.** Email attachments and bank CSV rows
are deduplicated on composite keys (message ID, vendor + date + amount,
document hash) so rerunning a sync never double-counts.

**Cost discipline.** Every Claude call writes a `UsageLog` row with input /
output tokens. An admin dashboard aggregates per-user spend and warns on
abuse. Extraction prompts are versioned in code so cost regressions are
attributable.

**Cache-correct dashboard.** The summary endpoint is RTK-Query-cached; the
cache is explicitly invalidated on extraction completion, transaction edits,
and Gmail sync so users never see stale aggregates.

**Migration safety.** `scripts/migrate.sh` wraps Alembic with a pre-flight
status check and a post-run verification so a broken migration chain fails
loud instead of corrupting the DB.

## Project layout

```
frontend/src/
  app/pages/           Route components
  app/features/        Domain feature components
  shared/              Cross-feature utilities, types, store, UI primitives
  __tests__/           Vitest suite

backend/app/
  api/                 Route handlers
  services/            Business logic (extraction, documents, email, tax, ...)
  repositories/        All DB queries
  mappers/             Raw extraction → ORM model
  models/              SQLAlchemy ORM (organized by domain)
  schemas/             Pydantic request/response
  workers/             Dramatiq background jobs
  core/                Config, auth, rate limiting, storage

alembic/versions/      DB migrations
deploy/                Caddyfile, systemd units
frontend/e2e/          Playwright specs
backend/tests/         pytest suite
```

## Testing

- **Targeted runner.** `scripts/run-affected-tests.sh` reads the git diff,
  maps changed files to affected tests via `scripts/test-map.json`, and runs
  only those. Full suite runs automatically when shared infrastructure
  (auth, DB session, conftest) changes.
- **E2E-as-regression-contract.** Playwright specs are the source of truth;
  a failing spec means the app is broken, not the test. Every new feature
  ships with an E2E that exercises the real user flow and asserts against
  both the UI and the API response.
- **Skeleton parity.** Skeleton loaders are tested to match the real page
  layout (same grid columns, same section count) to prevent layout shift.

## CI / CD

Three gating jobs run on every PR:

1. **Backend deps resolve** — `uv lock --check` catches dep-conflict classes
   of prod outage (the FastAPI-users / python-multipart kind) on the PR that
   introduces them, not in deploy logs days later.
2. **Backend tests** — pytest against a Postgres service container.
3. **Frontend build** — `tsc -b && vite build`, which means the TypeScript
   typecheck is part of the build gate.

Merges to `main` auto-deploy via GitHub Actions → VPS.

## Notable design decisions

- **Claude vision as a fallback, not a default.** Text PDFs are parsed with
  pypdf first; vision is only invoked when that yields no content. This
  keeps extraction cost an order of magnitude lower for the common case.
- **XLSX / CSV row cap.** Spreadsheets are truncated to ~500 rows before
  being sent to Claude. Users with larger sheets are prompted to split.
- **Argon2id password hashing** via fastapi-users.
- **OAuth token encryption.** Gmail refresh tokens are symmetrically
  encrypted at rest with `ENCRYPTION_KEY`.
- **JWT in localStorage** (not an HttpOnly cookie). Acceptable for this
  app's threat model; auth middleware still enforces server-side validation
  on every request and frontend decode is treated as display-only.

## Running locally

Full instructions live in `CLAUDE.md`. The short version:

```bash
# Backend
cd backend
uv sync
cp .env.example .env  # fill in ANTHROPIC_API_KEY, DATABASE_URL, SECRET_KEY, ENCRYPTION_KEY
bash scripts/migrate.sh
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## License

MIT. See `LICENSE`.
