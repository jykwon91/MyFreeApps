# MyBookkeeper E2E tests

Playwright tests under this directory split into two configs:

- **`playwright.layout.config.ts`** — runs `e2e/mocked/`, with no backend. Those specs answer every API call themselves via `page.route()` (helpers in `e2e/mocked/fixtures/`) or read files off disk. CI runs the whole folder in the `frontend-layout-e2e / mybookkeeper` job, so a new spec that needs no backend goes in `e2e/mocked/` and is picked up automatically.
- **`playwright.config.ts`** — everything else in `e2e/` (it skips `mocked/`). Full backend required: tests register a real user, drive the live UI, and assert real data effects. Run locally only.

## Running the full suite locally

```bash
# Required for ALL full-config E2E tests:
#   - Postgres reachable at the URL in backend/.env
#   - Backend running on :8000 (`uvicorn app.main:app --reload` from backend/)
#   - ALLOW_TEST_ADMIN_PROMOTION=true so /test/* endpoints are mounted
#
# Required for storage-touching tests (notably lease-import.spec.ts test 3):
#   - MinIO running and reachable from the backend.

# Bring up the shared infra MinIO (covers all monorepo apps):
docker compose -f infra/docker-compose.yml up -d minio

# Then from apps/mybookkeeper/frontend:
npx playwright test
```

## Storage-required tests

Tests that exercise the upload happy path (POST `/signed-leases/import`, POST `/listings/{id}/photos`, etc.) probe MinIO via `GET /admin/storage-health` at the start of the test and `test.skip()` cleanly with a remediation message if MinIO is unreachable.

This means:
- If you forget to start MinIO, the test won't silently pass — it'll skip with the exact command to fix it.
- If you start MinIO, the test asserts the full happy path strictly (navigation to the new resource, no fallback to an error toast).

The probe is per-test, not in `globalSetup`, so the rest of the suite still runs when MinIO is down.

## Why no full-suite CI job?

The full E2E suite needs a Docker stack (Postgres + MinIO + backend + worker + Caddy + frontend). Standing that up in CI on every PR adds 5–10 min of wall time and a maintenance surface (Dockerfile drift, env wiring, flake fixing) that isn't justified for a solo-dev repo. The discipline is: run `npx playwright test` locally before pushing PRs that touch backend services, frontend forms, or anything in `e2e/`. The layout-config tests still run in CI to catch the layout-shift / Caddy-header / blob-iframe class of regression.
