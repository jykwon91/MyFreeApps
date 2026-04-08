<!-- BEGIN GLOBAL PREFERENCES -->
## Global Software Engineering Preferences

### Code Quality
- Prefer simple, minimal solutions. Avoid over-engineering.
- Don't add abstractions, helpers, or utilities unless clearly necessary.
- Don't add comments unless the logic is non-obvious.
- Prefer editing existing code over creating new files.
- Write code for readability and maintainability first — optimise for the next developer reading it, not for cleverness.
- Never use hacks or workarounds — always prefer the cleaner, more elegant, and robust approach even if it takes more effort upfront.
- Don't duplicate code — extract repeated logic into a shared function or module rather than copying it.
- Always remove unused code, files, directories, imports, type exports, and stale references when making changes — don't leave dead code or orphaned references behind.

### Typing & Structure
- Always use strict typing. Avoid `any`, implicit types, or loose type definitions.
- Define one type, model, or interface per file — never group multiple type definitions in a single file.
- Keep types, constants, and configuration in dedicated directories — never define them inline in component, route, or service files.
- Separate configuration from code — keep environment-specific values, constants, and magic numbers in dedicated config or constants files, not inline.

### Architecture
- Modularize code by responsibility — each module, file, or function should have a single, well-defined purpose.
- Structure projects logically — group files by feature or domain, not by file type, so related code lives together.
- Prefer pure functions — functions with no side effects and deterministic output — unless state or side effects are required.
- Follow layered architecture — route/controller handlers should be thin wrappers that delegate to services; services contain business logic; repositories or data-access modules handle all database operations.
- Never import database or ORM primitives in route handlers or service files — all data access must go through repository functions. If a repository function doesn't exist for the query you need, create it first. Violations of layered architecture are bugs, not tech debt to address later.
- Extract data mapping and conversion logic into dedicated mapper modules — services orchestrate (load, decide, persist), mappers convert (raw data → model). Never duplicate model construction logic across multiple files.
- All imports belong at the top of the file — never inside functions or methods. If a circular import occurs, fix the architecture (break the cycle by restructuring modules), don't hide it with a lazy import.
- Before writing a custom solution, research whether a well-supported, well-maintained library already solves the problem. Suggest it as an option if it fits the exact requirement and doesn't significantly increase project overhead.

### Testing
- Always include tests in the same commit as the code change — never commit logic without corresponding tests, then add tests as a follow-up. Tests are part of the deliverable, not a separate step.
- E2E tests are regression contracts — when a test fails, the code is broken, not the test. Fix the code to make the test pass. Never change a test just to satisfy broken code. Only update tests when feature requirements explicitly change.
- Always include E2E layout tests when adding new pages or modifying page layouts.
- Always write E2E tests that exercise real user flows end-to-end — create test data via API or UI, perform the action being tested, verify the outcome in the UI and database state, then clean up test data. Never write E2E tests that only check if elements are visible or rendered — those are layout tests, not behavioral tests.
- Always write E2E tests that verify skeleton loading states match the loaded page structure — same sections, same grid columns, same element count.
- For any uniqueness constraint, deduplication logic, or entity-matching rule: enumerate and test all composite key combinations before implementation — same entity from same source, same entity from different sources, different entities sharing partial keys (e.g., same EIN but different documents). Never assume the obvious case is the only case.

### Security
- Never hardcode secrets or API keys in source files — always use environment variables. Committing `.env` files with dev/dummy values is acceptable.
- Always validate field names against an explicit allowlist before applying dynamic updates (`setattr`, spread operators, etc.).

### UX Patterns
- Never define components inline or inside other components — always extract to separate files and import.
- Extract reusable UI components for any pattern repeated 3+ times — loading states, empty states, badges, cards.
- Use toast banners or non-intrusive notifications for error and success feedback — never use `alert()` or modal dialogs for operation results.
- Use skeleton loaders for page loading states — never show plain text like "Loading..." as a placeholder. Skeletons should mirror the layout of the loaded page to prevent layout shift.
- Always show a loading state on buttons immediately when clicked — don't wait for the API response to indicate progress.
- Always design UI components and pages with mobile-first responsiveness — ensure touch targets are at least 44x44px, layouts work on small screens, data tables have responsive column visibility or card alternatives, and interactive elements support touch events alongside mouse events.
- Never block the UI or API responsiveness with background work — offload long-running tasks so users can continue interacting with the application.
- Always provide visible feedback for every user action — show progress during operations, confirm success on completion, and display clear error messages on failure. Never leave the user wondering if something happened.
- Before building or redesigning any page, define the information hierarchy — list every data point the page will display and justify its presence. If a data point isn't actionable on this page, it doesn't belong. Remove before adding. UX reversals (adding then removing elements) indicate the hierarchy wasn't validated before implementation.

### Data Integrity
- Always inspect actual data before fixing bugs — query the database, check API responses, examine extraction output. Never assume what the data looks like.
- Never make destructive data decisions (deletes, merges, choosing between records) based on metadata alone — always verify by inspecting the actual content of the records or documents involved.
- Never write fixes that drop, nullify, or silence valid data to avoid errors — if real data violates a constraint, fix the field mapping or the constraint, not the data. Data accuracy with the source is non-negotiable.
- Always evaluate schema changes against the full existing schema — enforce normalization (every fact stored once), referential integrity (every FK enforced with intentional cascade behavior), query efficiency (indexes support actual query patterns), type correctness (column types match the domain), and consistency (same conventions across all tables). Flag violations before implementing.
- Never introduce tech debt — every commit must leave the codebase cleaner than or equal to how it was found. If a change creates a new issue (broken test, missing validation, dead code, loose typing, missing skeleton), fix it in the same commit. Never defer new issues to a tech debt tracker — TECH_DEBT.md is for pre-existing issues discovered during audits, not for deferring work from the current session.

### Refactoring
- Never refactor or rewrite components without preserving all existing functionality — inventory current features before rewriting, verify each feature works after, and get explicit confirmation before removing any feature.

### Workflow
- Always run the QA generator (`g-qa`) on first use in a new project to create a domain-specific QA agent tailored to that project's tech stack and data types. Then run the generated QA agent after implementing features to write and run tests.
- Always run the pre-commit review agent (`g-pre-commit`) before committing code changes to catch security issues, logic errors, and performance problems early.
- Always run design agents (UX, architecture, data) before implementing features — design agents are solutioning partners, not post-implementation reviewers.
- Always create a new git branch for each feature or PR — never push multiple unrelated changes to the same branch. Maximum one user-facing feature per PR — multi-feature PRs make regressions impossible to isolate and reviews impossible to focus. If planning multiple features, implement and merge each separately.
- Always merge your own existing feature branches to main before starting new work — check `git branch --no-merged main` at the start of every session and create PRs for any of your unmerged branches first. Other developers' branches are their responsibility.
- When a user corrects a mistake, don't just fix it — identify the root cause and create a systemic fix (test, preference, or workflow change) so the same mistake never reaches the user again.
- Never create a new PR on the shared config repo (jkwon-claude-config) if you already have an open PR there — push additional changes to your existing open PR branch to avoid stale conflicts. Other developers' open PRs do not block you from creating your own.
- Always write and run E2E tests for every new feature before committing — verify E2E test files are staged alongside feature code and confirm a green result before proceeding. Unit tests alone are never sufficient validation for user-facing changes. Tests must cover the full user flow (form submission, API interaction, state changes, error handling), not just rendering or visibility checks.
- When a project has a targeted test runner (e.g., `scripts/run-affected-tests.sh` with a `test-map.json`), use it instead of running the full test suite. Only run the full suite when shared infrastructure changes (auth, config, models, database session, test fixtures) or when the targeted runner explicitly falls back. Keep the test map updated when adding new test files or source directories.
- Enforce critical workflow rules with automated hooks (pre-commit checks, post-test sentinels), not just preferences — if a rule is important enough to write down, it's important enough to block the commit when violated.
- Always run database migrations immediately after creating or modifying migration files — never leave migrations unapplied, as the running dev server will crash on the next request that touches new or altered columns.
- Never skip pipeline steps (design agents, test-writer, code-reviewer, pre-commit) for any reason — if completing the full pipeline isn't possible in the current session, pause and continue in the next session rather than cutting corners.
- Delegate volatile codebase reads (component APIs, schemas, route lists, test patterns) to focused Explore subagents instead of reading files individually in the main context — reserve main-context file reads for files that need to be edited.
- Never acknowledge a code quality issue, standards violation, or missing test without fixing it in the same session — if you identify something broken, fix it before committing. If the fix is too large for the current PR, create a separate branch and complete it in the same session.
- Code review runs per-PR, never retroactively across multiple PRs. Every PR must pass review independently before merging. If a retroactive review finds issues across prior PRs, that's a signal to strengthen the per-PR review agents, not to batch reviews later.
- Never mark an audit item as resolved without verifying zero remaining violations — after fixing, re-run the same scan (grep, lint, test) to confirm the count is zero. Report exact file counts with file names, not estimates. If you can't fix all violations in one pass, leave the item open with the remaining count and file list.
- Never leave test data in a dev or production database — if tests insert records via API or direct DB access, the teardown must delete them. Always verify no test artifacts remain after running tests or agents that touch live databases.
- Never combine multiple features into a single pipeline agent call — split work into one focused feature per invocation, each with its own design → implement → E2E test → review cycle, to prevent over-scoping and skipped pipeline steps.
- Before starting any development work (features, bug fixes, refactoring), check if the working directory is already in use: run `git status --porcelain` and `git branch --show-current`. If the repo has uncommitted changes or is on a feature/fix branch (not main/master), do NOT switch branches or start working — set up a git worktree with `git worktree add` and work entirely within it. This check is mandatory, not optional — skipping it causes dirty branches and merge conflicts across sessions. Only one session should create database migrations at a time.
<!-- END GLOBAL PREFERENCES — To override any of the above for this project, add your instructions below this line. -->

# CLAUDE.md

## Project

**MyBookkeeper** — a personal bookkeeping app focused on rental property management. Core value: AI-powered invoice extraction from PDFs, images, docs, and emails. Users upload documents or connect Gmail; Claude extracts structured financial data automatically.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, React Query, React Hook Form, Recharts, Radix UI |
| Backend | FastAPI, Python, SQLAlchemy 2.0 (async), PostgreSQL, Alembic, Pydantic 2 |
| Auth | fastapi-users, JWT (Bearer token) |
| AI | Anthropic Claude SDK (`backend/app/services/extraction/claude_service.py`) |
| Background jobs | Dramatiq + PostgreSQL broker, scheduler polls Gmail every 15 min |
| File parsing | pypdf (PDF), mammoth (DOCX), openpyxl (XLSX/CSV) |

## Directory Map

```
frontend/src/
  main.tsx                # React entry point
  App.tsx                 # Router + RequireAuth + AdminLayout
  lib/api.ts              # Axios instance with auth interceptor
  lib/constants.ts        # Nav items, categories, tags, colors
  lib/auth.ts             # Login/logout/token validation
  pages/                  # Route components
  components/Layout.tsx   # Main app sidebar
  components/AdminLayout.tsx # Admin portal sidebar
  features/               # Domain feature components

backend/app/
  main.py                 # FastAPI init, route registration, CORS
  core/                   # Config, auth, tags, parsers, storage, rate limiting
  db/session.py           # AsyncSession factory + unit_of_work
  api/                    # Route handlers (flat — no subdirectories)
  models/                 # SQLAlchemy ORM — organized by domain
    documents/  email/  extraction/  integrations/  organization/
    properties/  system/  tax/  transactions/  user/
    requests/  responses/
  schemas/                # Pydantic schemas — organized by domain
  repositories/           # DB queries — organized by domain
  services/               # Business logic — organized by domain
    extraction/  documents/  email/  transactions/  tax/
    integrations/  system/  organization/  properties/
  mappers/                # Data transformation (transaction, reservation, tax form)
  workers/                # Background jobs (flat)

alembic/versions/         # DB migrations
deploy/                   # Caddyfile, systemd service files
```

## Architecture

**Request flow — document upload:**
1. `Documents.tsx` → POST `/api/documents/upload` (multipart)
2. `api/documents.py` checks rate limit, saves to DB with status `processing`
3. Upload processor worker picks it up, calls `extraction/extractor_service.py` → text or base64
4. `extraction/claude_service.py` calls Anthropic API → structured extraction
5. `mappers/transaction_mapper.py` + `mappers/reservation_mapper.py` build models
6. Transaction + Document saved; UsageLog records input/output tokens
7. Frontend polls via React Query

**Email sync (background):**
- `scheduler_worker.py` → Dramatiq queue → `email_sync_worker.py`
- Deduped on `email_message_id` column

**Auth:**
- JWT Bearer token stored in `localStorage`
- Frontend decodes client-side for display; backend validates in middleware for audit context
- Automatic logout on 401

**Data isolation:**
- All rows filtered by `user_id` — no cross-user data access
- Cascade delete: deleting a user wipes all their data

## UX: AI Interactions

All AI-facing UI (extraction feedback, status messages, error states) should feel conversational and human — like a helpful assistant, not a system log. Use first-person ("I", "me"), casual phrasing, and show personality. Examples:
- Loading: "Hmm, let me think about that..." (not "Processing...")
- Success: "Got it, I think I understand now." (not "Feedback processed successfully.")
- Prompting action: "Want me to try again?" (not "Click to re-extract.")
- Finding related items: "I also found 5 similar documents that might have the same issue." (not "5 similar documents found.")
- Failure: "I wasn't able to figure that out. Could you be more specific?" (not "Error: extraction failed.")

## Key Conventions

**Database:**
- UUID primary keys throughout (PostgreSQL UUID type)
- Async driver (asyncpg) for app; sync driver (psycopg2) for Alembic only — use `database_url_sync` property
- `raw_extracted` is a JSONB column on Invoice — stores the full Claude response
- Never use synchronous SQLAlchemy calls in async route handlers

**Categories:**
- `Category` enum defined in `backend/app/models/invoice.py`
- Frontend repeats these as string literals in `lib/types.ts` — keep both in sync when adding categories
- `uncategorized` is the fallback when extraction fails

**File extraction:**
- PDFs: try pypdf text first; fall back to Claude vision if empty
- Images: Claude vision directly
- XLSX/CSV: capped at ~500 rows to limit token usage

**Rate limiting:**
- 50 uploads/user/day — configured in `core/config.py`
- Returns 429 if exceeded

**File size:**
- 10MB max — configured in `core/config.py`
- Returns 413 if exceeded

**Claude extraction prompt:**
- Code is source of truth in `services/extraction/prompts/base_prompt.py`
- Confidence values are `"high"` / `"medium"` / `"low"` (strings, not numeric)

**Frontend proxy:**
- Vite dev server proxies `/api` → `localhost:8000` (see `vite.config.ts`)
- Production uses Caddy reverse proxy (`deploy/Caddyfile`)

## Commands

**Frontend** (run from `frontend/`):
```bash
npm run dev      # Dev server on :5173
npm run build    # TypeScript check + Vite build to dist/
npm run lint     # ESLint
```

**Backend** (run from `backend/`):
```bash
source .venv/bin/activate
uvicorn app.main:app --reload          # API on :8000
python -m app.workers.scheduler_worker # Email scheduler
python -m dramatiq app.workers.email_sync_worker  # Dramatiq worker
bash scripts/migrate.sh                # Apply migrations (with verification)
bash scripts/migrate.sh --status       # Check migration status
alembic revision --autogenerate -m "description"  # New migration
```

**Required env vars** (see `.env.example`):
- `DATABASE_URL` — postgresql+asyncpg://...
- `ANTHROPIC_API_KEY`
- `SECRET_KEY` — JWT signing
- `ENCRYPTION_KEY` — OAuth token encryption
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Gmail OAuth

## Testing

- **Frontend**: Vitest + React Testing Library (`frontend/src/__tests__/`)
  - Run: `npm test` (from `frontend/`)
  - When modifying any file under `frontend/src/`, always write or update the corresponding test file
- **Backend**: pytest + pytest-asyncio (`backend/tests/`)
  - Run: `pytest` (from `backend/` with venv active)
  - When modifying any file under `backend/app/`, always write or update the corresponding test file
- **Targeted test runner**: `bash scripts/run-affected-tests.sh`
  - Reads git diff, maps changed files to affected tests via `scripts/test-map.json`, runs only those
  - Use this instead of running the full suite during development
  - Falls back to full suite when shared infrastructure changes (auth, config, models, db session, conftest)
  - Force full suite: `bash scripts/run-affected-tests.sh --full`
  - Custom diff base: `bash scripts/run-affected-tests.sh HEAD~1`
- **When to update test-map.json**: When adding new test files or new source directories, add them to the relevant domain in `scripts/test-map.json`. If a new domain is needed, create a new entry.

## Known Gotchas

- Gmail OAuth tokens stored in `Integration` model; encryption is configured but verify it's active before touching that code
- Gmail OAuth tokens stored in `Integration` model; encryption is configured but verify it's active before touching that code
- Frontend JWT decode is client-side — don't rely on it for security decisions
- `Category` enum values must stay in sync between backend models and frontend types manually

## Deployment

**First-time setup** (new VPS only — run once):
```bash
# Copy SSH deploy key to /root/.ssh/deploy_key first, then:
cd /root && sudo bash setup.sh
# Prompts for: Anthropic API Key, Google Client ID, Google Client Secret
```
This installs everything (PostgreSQL, Python, Node, Caddy), clones the repo, writes `.env`, sets up systemd services, configures backups, and installs management scripts to `/usr/local/sbin/`.

**Day-to-day deploys**: Push to main or merge a PR — GitHub Actions SSHs into the server and deploys automatically. No need to SSH in manually.

**Manual deploy** (if needed):
```bash
sudo mybookkeeper-update
```

**Management scripts** (installed to `/usr/local/sbin/`, run from anywhere):
- `sudo mybookkeeper-setup` — full server provisioning
- `sudo mybookkeeper-update` — pull, install deps, migrate, build, restart
- `sudo mybookkeeper-backup` — manual database backup
- `sudo mybookkeeper-restore /path/to/backup.sql.gz` — restore from backup

**When to SSH into the server**:
- Restore from backup
- Check logs: `journalctl -u uvicorn -n 50`
- Debug production issues

**Database backup/restore** — see `deploy/DATABASE_BACKUP_RECOVERY.md`
- Automated daily backups at 2 AM to `/srv/mybookkeeper/backups/`
- 30-day retention

**Health check**: `curl https://<domain>/health` — returns DB connectivity status

## Workflow

- Branch naming: `feature/<name>`, `fix/<name>`
- PRs required before merging to main
- Always create a new branch for each feature or PR — never push multiple unrelated features to the same branch
- Use `/fix-issue <number>` to work a GitHub issue end-to-end
- Use `/review-pr <number>` to review a PR before merging

## Tech Debt Policy

`mode: fix`

When `mode: fix`, the pipeline (`g-pipeline`, `g-build-feature`) will actively fix existing issues from `TECH_DEBT.md` during each run — highest severity first, up to `max_fixes_per_run`. When `mode: log-only`, the pipeline only logs new issues and never touches existing ones.

- `max_fixes_per_run: 3` — cap to prevent scope creep into a full rewrite
- Priority order: Critical > High > Medium > Low
- After fixing a tech debt issue, remove it from `TECH_DEBT.md` and update the counts
- Re-run all test suites after each audit fix to confirm no regressions

## Compact Instructions

When compacting, preserve: modified file list, any migration names, open questions about Category enum or Claude extraction prompt changes.
