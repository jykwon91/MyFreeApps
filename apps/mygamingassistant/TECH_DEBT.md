# MyGamingAssistant — Tech Debt Log

<!-- 2 open issues -->

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
