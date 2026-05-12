# MyGamingAssistant — Tech Debt Log

<!-- 6 open issues -->

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

### [Ingestion] Disk space guard for download directory is unenforced

- **Severity:** Medium
- **Effort:** Medium (2-3 hours)
- **Location:** `apps/mygamingassistant/backend/app/core/config.py`, `ingestion_orchestrator.py`
- **Problem:** `INGESTION_DOWNLOAD_DIR_MAX_GB` is stored in config but never checked. If many
  large videos are downloaded concurrently (or cleanup fails), the download directory can fill
  the VPS disk. The orchestrator always downloads without checking available space.
- **Recommendation:** Before calling `download_video`, check `shutil.disk_usage(download_dir)`
  and skip/abort if free space falls below `ingestion_download_dir_max_gb * 0.8`. Log a WARNING
  with disk stats whenever skipping for this reason.

---

### [Ingestion] Background task sync uses fire-and-forget with no status surface

- **Severity:** Medium
- **Effort:** High (4-8 hours, deferred to PR 6 APScheduler work)
- **Location:** `apps/mygamingassistant/backend/app/api/sources.py`
- **Problem:** `POST /api/sources/{id}/sync` returns a `SyncJobResponse` with a `job_id`, but
  that job_id is never stored or queryable. The frontend has no way to poll for sync progress
  or learn that a sync completed vs failed. The `status` field in the response is always
  `"started"`. Any error inside `sync_source` is only visible in server logs.
- **Recommendation:** This is intentionally deferred to PR 6 (APScheduler). When APScheduler
  is added, replace BackgroundTask with a proper job queue that persists job state. Until then,
  the source's `last_synced_at` + `last_sync_stats` on the next GET /api/sources poll serves as
  the completion signal.

---
