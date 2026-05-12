# MyGamingAssistant — Tech Debt Log

<!-- 6 open issues | 2 resolved -->

---

### [Frontend] JS bundle exceeds 500KB (single-chunk)

- **Severity:** Medium
- **Effort:** Medium (2-4 hours)
- **Location:** `apps/mygamingassistant/frontend/vite.config.ts`
- **Problem:** Vite build emits a single 645KB JS bundle (206KB gzipped). As the app grows,
  this will increase initial load time noticeably, especially on slow connections.
- **Recommendation:** Add `build.rollupOptions.output.manualChunks` to extract react-router,
  redux, and lucide-react into separate chunks. React+Redux alone are ~200KB of this.
  Alternatively, add lazy loading on route level with `React.lazy()` + `<Suspense>`.

---

### [Backend tests] Lineup API tests require a running PostgreSQL

- **Severity:** Low
- **Effort:** Low (1-2 hours)
- **Location:** `apps/mygamingassistant/backend/tests/test_lineups.py`
- **Problem:** The `auth_client` fixture relies on a real PostgreSQL connection on port 5435.
  Tests cannot run in local dev environments without a running DB instance. The health
  tests (which use `TestClient` without DB) pass fine, but lineup tests are always skipped
  when no DB is running.
- **Recommendation:** Add a `pytest-docker` or `docker-compose` fixture that spins up a
  test Postgres container automatically (mirrors how MBK's CI handles it). Alternatively,
  add a `conftest.py`-level `skipif` that gracefully skips DB-dependent tests instead of
  erroring with a connection failure.

---

### [Ingestion] Source soft-delete is a workaround — no deleted_at column

- **Severity:** Medium
- **Effort:** Low (1-2 hours)
- **Location:** `apps/mygamingassistant/backend/app/repositories/game/source_repo.py`
- **Problem:** `soft_delete_source` sets `config_json["deleted"] = True` inside the JSON blob
  rather than a proper `deleted_at DateTime` column. This means deleted sources appear in
  `list_sources` unless callers filter `config_json["deleted"]`, the source schema exposes
  deleted status inconsistently, and there is no timestamped audit of when deletion happened.
- **Recommendation:** Add `deleted_at: Mapped[datetime | None]` to the `Source` model, a
  migration to add the column, and update `soft_delete_source`/`list_sources` to use it.
  Update `SourceRead` to omit `deleted` from `config_json`.

---

### [Ingestion] Disk space guard for download directory is unenforced ✅ RESOLVED PR 6

- **Resolved:** `cleanup_ingestion_downloads` APScheduler job (runs every 1h) enforces
  `INGESTION_DOWNLOAD_DIR_MAX_GB` by deleting oldest files first until under the cap.
  Pre-download enforcement (check free space before downloading) is still a future improvement.

---

### [Ingestion] Background task sync uses fire-and-forget with no status surface ✅ RESOLVED PR 6

- **Resolved:** APScheduler is now wired. The `sync_all_sources` job (every 6h) replaces the
  fire-and-forget BackgroundTask for scheduled runs. The manual `POST /api/sources/{id}/sync`
  endpoint still uses BackgroundTask for one-off triggers — job state persistence is a future
  enhancement (see new debt entry below).

---

### [Ingestion] Manual sync job_id is not persisted or queryable

- **Severity:** Low
- **Effort:** Medium (3-5 hours)
- **Location:** `apps/mygamingassistant/backend/app/api/sources.py`, `source_service.py`
- **Problem:** `POST /api/sources/{id}/sync` returns a synthetic `job_id` but that ID is never
  stored. The frontend cannot poll for completion. `last_synced_at` on the source serves as the
  only completion signal. For large playlists this can mean the user has no visibility into
  whether a manually-triggered sync is still running or has finished.
- **Recommendation:** When APScheduler job store is upgraded (or a lightweight jobs table added),
  persist manual sync requests with status=running/completed/failed and expose a
  `GET /api/sources/{id}/sync-status` endpoint. Until then, the Sources page should poll
  `GET /api/sources` and watch `last_synced_at` for change.

---

### [Backend tests] LineupPackage service tests require running PostgreSQL

- **Severity:** Low
- **Effort:** Low (1-2 hours)
- **Location:** `apps/mygamingassistant/backend/tests/test_lineup_package_service.py`
- **Problem:** `test_lineup_package_service.py` requires a live PostgreSQL connection (same
  `auth_client` fixture pattern as `test_lineups.py`). Tests are silently skipped when no DB
  is available. DB-dependent tests should either auto-provision a container or emit a clear
  skip message so CI knows it's not running them.
- **Recommendation:** Same fix as the existing `test_lineups.py` debt — add `pytest-docker`
  fixture or a `conftest.py` skipif guard that warns clearly when DB is unavailable.

---
