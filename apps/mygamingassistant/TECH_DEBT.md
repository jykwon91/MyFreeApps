# MyGamingAssistant - Tech Debt Log

> Last scanned: 2026-05-16 (full best-practice audit: data / architecture / UX / security)
> Issues: 1 critical, 4 high, 6 medium, 2 low

mode: log-only - fix only Critical items that block the current feature; log everything else here.

Scope note: MGA is intentionally a casual single-user, public-read / auth-write app with NO Sentry. Those are locked product decisions and are NOT flagged below. The auth-write router-level-guard model is correctly implemented (verified games.py, lineups.py, lineup_packages.py, sources.py, scheduler.py, test_helpers/router.py).

---

## Critical

### [Data] Lineup Library - Valorant maps ship with ZERO zone polygons; every Valorant lineup is unrenderable by construction

- **Severity:** Critical
- **Effort:** L (4+ hours - 67 polygons hand-authored over radar images)
- **Location:** backend/app/fixtures/valorant_maps.json (all 9 maps); contrast backend/app/fixtures/_apply_cs2_polygons.py (CS2 has its polygon-injection helper)
- **Problem:** Audited every fixture zone. All 8 CS2 maps have 100% polygon coverage (Mirage 10/10, Inferno 8/8, etc.). All 9 Valorant maps have 0%: bind 0/8, haven 0/8, split 0/8, ascent 0/8, icebox 0/7, breeze 0/7, fracture 0/7, pearl 0/7, lotus 0/9 - 67 zones, none polygoned. Because LineupRead.effective_stand_x/y and effective_target_x/y (schemas/game/lineup_schemas.py:108-157) correctly return None when a zone has no polygon (the deliberate anti-(0.5,0.5)-sentinel design - that part is right), every Valorant lineup with no explicit anchor is unplaceable on the map. The Edit-zones operator path and the UnplaceableLineupsNotice surface this honestly, but the product ships with a whole game's content invisible. There is no CS2-style _apply_valorant_polygons.py seed helper, so even bulk seeding is manual.
- **Recommendation:** Add backend/app/fixtures/_apply_valorant_polygons.py mirroring _apply_cs2_polygons.py (rect/poly helpers, re-runnable, reports UNMATCHED). Author approximate seed polygons for all 67 Valorant zones anchored to the radar images (centroid-correct is enough - the operator editor #656 refines edges). Run it, re-run load-fixtures (idempotent backfill via game_repo.upsert_map_zone only fills empty polygons, so it won't clobber operator edits). Unblocks the entire Valorant half of the app.

---

## High

### [Architecture] Lineup Library - ORM/DB access in route handlers (CLAUDE.md never-import-ORM-in-routes violated in 2 modules)

- **Severity:** High
- **Effort:** M (2-4 hours)
- **Location:** backend/app/api/games.py:24-26,64,84-90,111-126,210-211,237,248; backend/app/api/lineups.py:38,84-94,130-165,240-246,282-285
- **Problem:** MGA CLAUDE.md mandates Routes to Services to Repositories; never import ORM/DB in route handlers. Both modules import select / AsyncSession / selectinload and run raw db.execute(select(...)) plus db.flush() / db.commit() directly in handlers: games.py list_games/list_maps/get_map build queries inline, confirm_minimap_upload does db.flush()+db.commit() (210-211), update_map_zones does db.commit() (248); lineups.py _resolve_map/list_lineups/list_pending_lineups/get_zone_density resolve Game/Map/Zone/UtilityType slugs via inline db.execute(select(...)). Same class of layering erosion that produced the silent PATCH-rollback bug recorded in lineup_service.py history. The slug->ID resolution logic is duplicated across games.py, lineups.py, and classifier_service._resolve_slugs - three copies.
- **Recommendation:** The exemplar already exists: lineup_repo.py owns its transaction boundary (flush->refresh->commit, rollback+re-raise) and lineup_service.py never touches AsyncSession for mutation. Mirror that. Move games/maps reads into game_repo (it already has get_game_by_slug, get_map_detail - the handlers just aren't using them), add map_service.confirm_minimap_upload owning its commit in game_repo, route zone-bulk-update commit into game_repo.update_zone_polygons_bulk (it already flushes - add commit there, drop from route). Extract the shared slug->ID resolver into one function consumed by all three call sites.

### [Architecture] Sources / Ingestion - db.commit() in the service layer (commits belong in repositories)

- **Severity:** High
- **Effort:** M (1-3 hours)
- **Location:** backend/app/services/game/source_service.py:84,102; backend/app/services/ingestion/ingestion_orchestrator.py:307,475,506
- **Problem:** The commit/rollback boundary belongs in the repository layer. source_service.create (db.commit()+db.refresh() 84-85) and source_service.delete (db.commit() 102) commit in the service; source_repo.create_source and soft_delete_source only flush(), pushing the commit up - the inverse of lineup_repo. ingestion_orchestrator._process_chapter (307), sync_source (475,506) also commit in a service module. (lineup_package_service.py and map_service.py were verified clean - they correctly delegate; this is specific to source + ingestion.)
- **Recommendation:** Move commit ownership into source_repo (create_source, soft_delete_source, update_sync_stats each flush->commit->rollback-on-error, matching lineup_repo.create_lineup). The orchestrator is a coordinator, not a route - its commit is more defensible, but for consistency push the per-chapter row commit into a lineup_repo finalizer and the sync-stats commit into source_repo.update_sync_stats. Document the chosen boundary in the orchestrator docstring.

### [Data / Architecture] Classifier - ingest-time reference data spans ALL games; cross-game zone bleed (root cause of CS2/Valorant misclassification)

- **Severity:** High
- **Effort:** M (2-4 hours)
- **Location:** backend/app/services/classification/classifier_service.py:948 (_load_reference_data(db, game_id=None)), _build_reference_text (291), _check_game_map_consistency (441), _resolve_slugs (329)
- **Problem:** At ingest time there is no lineup.game_id yet, so classify_frames_for_lineup_decision loads the reference block for every game (line 948) and game_hint only narrows the prompt textually (Expected game: cs2) - not a hard constraint. Claude is shown CS2 Mirage zones AND Valorant Ascent market/window zones in the same prompt; a CS2 Mirage screenshot can return tagged with Valorant zone slugs. The _check_game_map_consistency guard only catches game/map slug mismatch (and only if Claude self-reports the right game_slug); a within-the-wrong-game zone slug that doesn't resolve produces a silent suggested_target_zone_id=None. The failure is recorded only as free text appended to classification_reasoning - no structured/queryable signal, so the operator misclassification problem has no observability surface beyond reading prose per-card.
- **Recommendation:** (1) When game_hint is a known game slug, resolve it to a game_id and pass it to _load_reference_data so the prompt only contains that game maps/zones - a hard scope, not a textual hint. Keep the all-games path only when game_hint is absent/unknown. (2) Persist a structured classification-diagnostics field (e.g. classification_unresolved list or a small JSON column) capturing which slugs failed to resolve, so the review queue can filter lineups-with-unresolved-zones instead of scanning reasoning text. Directly attacks the cited misclassification + diagnostic-black-hole pair.

### [Data] Lineup Library - CS2 Mirage zone set incomplete vs callouts the classifier emits (market/window/granular-mid absent)

- **Severity:** High
- **Effort:** M (1-3 hours)
- **Location:** backend/app/fixtures/cs2_maps.json (mirage: 10 zones), backend/app/fixtures/_apply_cs2_polygons.py:33-44
- **Problem:** Mirage fixture has exactly a-site, a-palace, a-ramp, catwalk, mid, b-site, b-van, b-apts, t-spawn, ct-spawn. Missing common Mirage callouts real lineup videos chapter on - connector, window, top-mid, jungle, stairs, firebox, tetris, underpass. market/window are Valorant-Ascent slugs that, combined with the all-games reference bleed (High item above), the classifier emits for CS2 Mirage - they fail slug resolution silently. Other CS2 maps reference a-main/b-main (anubis, ancient) but Mirage/Inferno/Dust2 lack the granular mid/connector callouts creators use as chapter titles. Result: many ingested CS2 lineups land with suggested_target_zone_id=NULL, unacceptable without manual zone assignment.
- **Recommendation:** Expand cs2_maps.json per-map zone sets to cover the standard pro callout vocabulary (cross-reference a canonical CS2 callout map per map). Add new zones to _apply_cs2_polygons.py POLYGONS table so they ship with seed geometry (the helper already reports UNMATCHED/UNUSED - use it to verify parity between JSON zone list and polygon table). Pair with the classifier game-scoping fix so Valorant slugs can no longer leak into CS2 classifications.

---

## Medium

### [Data] Ingestion - Source soft-delete is config_json[deleted], not a deleted_at column

- **Severity:** Medium
- **Effort:** Low (1-2 hours)
- **Location:** backend/app/repositories/game/source_repo.py:32-33,67-87; backend/app/services/scheduling/scheduler_service.py:201-209
- **Problem:** soft_delete_source sets config_json[deleted]=True inside the JSON blob. list_sources filters it in Python (_is_deleted), the scheduler re-implements the same config.get(deleted) is True check (scheduler_service.py:203), SourceRead exposes the deleted key in config_json to clients, and there is no timestamped audit of when the delete happened. The flag-in-JSON pattern is duplicated across repo + scheduler - a 3rd reader will re-duplicate it. Standing debt carried from the previous scan; still open.
- **Recommendation:** Add deleted_at: Mapped[datetime|None] to the Source model + an Alembic migration. Update soft_delete_source to set the timestamp, _is_deleted/list_sources/get_source/scheduler to test the column, SourceRead to omit deleted from config_json (expose a clean deleted_at field). Matches the monorepo schema convention (soft-delete via a real column).

### [Data / Diagnostics] Classifier - invalid confidence from Claude silently dropped (except: pass)

- **Severity:** Medium
- **Effort:** S (< 1 hour)
- **Location:** backend/app/services/classification/classifier_service.py:763-764 and 1083-1084
- **Problem:** Both classify paths do try: confidence=float(raw_conf) except (TypeError, ValueError): pass. A model returning a non-numeric confidence leaves confidence=None with no log line - the one explicit diagnostic black hole in an otherwise well-instrumented file (the Anthropic API error handling here is exemplary: captures error.type, status codes, structured context - keep that, it is the model for the rest of the codebase). A null confidence then changes review-queue filtering behaviour (confidence_max treats null as show-it) with no trace of why.
- **Recommendation:** Replace both pass blocks with logger.warning(classify: non-numeric confidence from model: raw=%r chapter=%r, raw_conf, chapter_title) before falling through to None. Five lines; closes the only swallow in the classifier. Aligns with the capture-don't-swallow rule for third-party-API responses.

### [Architecture] Schemas - lineup_schemas.py is a 14-class catch-all; Source schemas misfiled (one-schema-per-file violated)

- **Severity:** Medium
- **Effort:** M (1-3 hours)
- **Location:** backend/app/schemas/game/lineup_schemas.py (14 classes incl. SourceCreate, SourceRead, SyncJobResponse); backend/app/schemas/game/map_schemas.py (8 classes)
- **Problem:** CLAUDE.md mandates one schema per file. lineup_schemas.py is a 353-line catch-all, and - worse for discoverability - SourceCreate, SourceRead, SyncJobResponse are source-domain schemas living in the lineup schema file (imported by sources.py:26 and source_service.py:20 from the wrong module). A reader looking for a source_schemas.py won't find one. (Strict literal one-class-per-file is impractical for tightly-coupled request/response pairs; the real defect is the cross-domain misfiling + file size.)
- **Recommendation:** Split at domain seams, not per-class: create schemas/game/source_schemas.py (SourceCreate, SourceRead, SyncJobResponse), move the three source schemas there, update the two import sites. Optionally extract lineup_review_schemas.py for the review cluster if the file keeps growing. Prioritize the source-schema relocation - that is the actual discoverability bug.

### [Architecture] TOTP route - db.commit() in api/totp.py (monorepo-wide pattern, mirrors canonical)

- **Severity:** Medium
- **Effort:** M (cross-app - coordinate with canonical)
- **Location:** backend/app/api/totp.py:67,88,130,142,153,170,194
- **Problem:** api/totp.py commits directly in route handlers (after log_auth_event). Violates MGA layering - but it is a byte-faithful mirror of canonical: MBK api/totp.py same commits at 129/141/152/171/197, MJH at 103/132/187/199/213/232/257. Per monorepo parity discipline, fixing this in MGA alone would create drift; canonical must be corrected first and mirrored forward. Flagged so it is tracked, not silently accepted.
- **Recommendation:** Do NOT fix in MGA in isolation. Raise as a canonical-correction item: the auth-event commit should move into a log_auth_event-owning boundary in platform_shared (or the auth-event service), then mirror the corrected pattern into all three apps in one sweep. Until then, accepted parity debt.

### [UX] Sources - manual sync has no job-status surface; completion inferred by polling last_synced_at

- **Severity:** Medium
- **Effort:** M (3-5 hours)
- **Location:** backend/app/api/sources.py:99-130 (synthetic job_id never persisted); frontend/src/pages/Sources.tsx:28-29,300-347 (5s poll, 5min cap)
- **Problem:** POST /api/sources/{id}/sync returns a synthetic job_id never stored. The frontend can't poll job status; it captures last_synced_at at kick time and polls GET /sources until it changes or a 5-minute deadline elapses, then says still-running-refresh-later. For a large playlist the operator gets an ambiguous terminal state (slow, or failed?). The UX is honest about the ambiguity (good - no faked state) but the capability gap remains. Carried from previous scan; still open.
- **Recommendation:** When the APScheduler job store is upgraded (or add a lightweight sync_jobs table), persist manual-sync requests with status=running/completed/failed + stats, expose GET /api/sources/{id}/sync-status. Frontend then shows a determinate progress/result instead of a timeout guess.

### [Frontend] Bundle - single ~645 KB JS chunk (no code-splitting)

- **Severity:** Medium
- **Effort:** M (2-4 hours)
- **Location:** frontend/vite.config.ts
- **Problem:** Vite emits one ~645 KB (206 KB gzip) bundle. Grows with the app; hurts first paint on slow links. Carried from previous scan; still open.
- **Recommendation:** Add build.rollupOptions.output.manualChunks to split react-router / redux / lucide-react, or React.lazy() + Suspense at route level (the heavy LiveCs2* calibration pages are good split points - large and off the main path).

---

## Low

### [Backend tests] Lineup / LineupPackage / sources tests require a running PostgreSQL

- **Severity:** Low
- **Effort:** Low (1-2 hours)
- **Location:** backend/tests/test_lineups.py, backend/tests/test_lineup_package_service.py, backend/tests/test_sources.py
- **Problem:** The auth_client fixture needs a live Postgres (port 5435). DB-dependent tests are silently skipped when none is running - CI can't tell it is not running them. Carried from previous scan; still open.
- **Recommendation:** Add a pytest-docker / docker-compose fixture (mirror MBK CI) or a conftest.py skipif that emits a loud explicit skip reason so a skipped DB suite is visible, not silent.

### [Diagnostics] Classifier - failed zone slug resolution only surfaces as appended reasoning prose

- **Severity:** Low
- **Effort:** S (< 1 hour) - overlaps the High classifier item; tracked separately for the smaller standalone win
- **Location:** backend/app/services/classification/classifier_service.py:329-433 (_resolve_slugs appends to failures), 787-802 / 1139-1154
- **Problem:** Every unresolved slug is appended to classification_reasoning as free text. It IS captured (not swallowed - good), but unqueryable: the operator can't filter the review queue to lineups-whose-target-zone-did-not-resolve, exactly the cohort created by the misclassification problem. (The full structured-diagnostics fix is folded into the High classifier item; this entry exists so the minimal version is not lost if the larger refactor is deferred.)
- **Recommendation:** At minimum, log _resolve_slugs failures at WARNING with structured fields (lineup/chapter, which slug, which game) so they are greppable in the access log even before a schema column is added.

---

## Resolved (this scan)

- ~~Disk space guard for download directory unenforced~~ - cleanup_ingestion_downloads APScheduler job enforces INGESTION_DOWNLOAD_DIR_MAX_GB (verified scheduler_service.py:237+).
- ~~Background task sync fire-and-forget with no status surface~~ - APScheduler sync_all_sources (6h) wired; the residual manual-sync gap is re-tracked as the Medium no-job-status-surface item above (scoped down, not a regression).
- ~~(0.5,0.5) map-centre sentinel masking position-unknown~~ - verified fixed: LineupRead.effective_* (lineup_schemas.py:108-157) returns None, and MapLineupPins.isUnplaceable (MapLineupPins.tsx:59-66) null-checks rather than rendering a fabricated centre pin. UnplaceableLineupsNotice surfaces the count honestly. No action needed.
- ~~Bulk-accept silent failure~~ - fixed in PR #690 (not re-reported per scope).
- ~~Broken documented load-fixtures CLI command~~ - fixed in PR #691 (not re-reported per scope).

---

### [Backend] Layering audit finding #3 — db.commit/mutation out of routes & services ✅ RESOLVED

- **Resolved:** All remaining `db.commit()` / `db.flush()` / raw ORM mutation calls were
  relocated out of route handlers and service files into the repository layer /
  `unit_of_work()`, per the MGA "Routes → Services → Repositories; never import ORM/DB in
  route handlers" rule and the PR #687 precedent. Touched: `api/games.py` (now thin —
  reads via `game_repo`, minimap/zone writes via `map_service` → `game_repo`-owned
  commit), `api/lineup_packages.py` + `lineup_package_service.py` (commit boundary moved
  into the service via `unit_of_work()`), `api/sources.py` + `source_service.py`
  (`unit_of_work()`), `ingestion_orchestrator.py` (commits delegated to
  `lineup_repo.commit_classifier_run` + new `source_repo.record_sync_stats`; the stats
  path is now atomic — a failed `update_sync_stats` rolls back instead of silently
  degrading; the exc_info=True structured-logging seam preserved). New repo mutators
  (`game_repo.set_minimap_url` / `commit_zone_polygon_updates` / `get_map`,
  `source_repo.record_sync_stats`) own commit + rollback like `lineup_repo`. Conftest
  gained a symmetric `unit_of_work` test-session binding (complements the existing
  `get_db` override) so services owning their own transaction boundary are testable.
  `totp.py` deliberately excluded (canonical-mirrored debt — see entry below).

---

### [Backend] Read-side inline ORM queries remain in `api/lineups.py`

- **Severity:** Low
- **Effort:** Medium (2-3 hours)
- **Location:** `apps/mygamingassistant/backend/app/api/lineups.py` (`from sqlalchemy import
  select`; inline `db.execute(select(Game/Map/MapZone/UtilityType)...)` in `_resolve_map`,
  `list_lineups`, `get_zone_density`, `list_pending_lineups`)
- **Problem:** Finding #3's commit/mutation relocation is complete, but `lineups.py` still
  resolves slug→id lookups with inline `select()` statements rather than delegating to
  `game_repo`. These are pure reads (no write/commit), so they're a layered-architecture
  style violation, not a data-integrity risk. They were intentionally left out of the
  finding-#3 PR to keep it coherent (≤8 files) and avoid regression risk in the most
  complex route module.
- **Recommendation:** Add `game_repo` resolver functions (`get_game_by_slug` already
  exists; add map/zone/utility-by-slug-within-game helpers) and replace the four inline
  `select()` sites in `lineups.py`, then drop the `from sqlalchemy import select` import.
  Pair-fix with the `classifier_service.py` inline `select` (same class of read-side
  layering debt, also out of finding-#3 scope).

---

## Glance-board polish (deferred from PR1 code review — 2026-05-17)

Stylistic items flagged in the glance-board PR1 review and intentionally deferred per log-only policy.

### [Frontend] GlanceBoardMinimapSidebar — IIFE tooltip pattern in JSX

- **Severity:** Low
- **Location:** `frontend/src/components/lineup/GlanceBoardMinimapSidebar.tsx` (hover tooltip rendered via `{hoveredZoneSlug && (() => { ... })()}`)
- **Problem:** IIFE inside JSX is non-idiomatic and lint-unfriendly. The hover state belongs in a small sub-component (`ZoneTooltip`) or early-return variable so the return is clean.
- **Recommendation:** Extract tooltip into a `ZoneTooltip` sub-component in the same file.

### [Frontend] GlanceBoardOperatorMenu — two mergeable useEffects

- **Severity:** Low
- **Location:** `frontend/src/components/lineup/GlanceBoardOperatorMenu.tsx` (two separate `useEffect` blocks both gated on `open`)
- **Problem:** Both effects depend solely on `open` and could share one `useEffect` with two event-listener registrations and a single cleanup. Minor readability/lint friction.
- **Recommendation:** Merge into one `useEffect` with both `addEventListener` / `removeEventListener` calls in the same block.

### [Frontend] MapPage — MessageChannel deferral for `setActiveCardIndex`

- **Severity:** Low
- **Location:** `frontend/src/pages/MapPage.tsx` (MessageChannel pattern inside `useEffect` for `setActiveCardIndex(0)`)
- **Problem:** The `MessageChannel` deferral is a non-obvious pattern. A plain `useEffect` with `setActiveCardIndex(0)` inside satisfies the react-hooks/exhaustive-deps rule; the deferral adds complexity without observable benefit at this call site.
- **Recommendation:** Replace `MessageChannel` deferral with a direct `setActiveCardIndex(0)` call in the `useEffect` body.

### [Frontend] MapPage — fragmented empty-state logic

- **Severity:** Low
- **Location:** `frontend/src/pages/MapPage.tsx` (two separate empty-state conditions in the main scroll area — filtered-empty ternary and the below-board CTA)
- **Problem:** The two empty-state render paths (filtered empty + no-filters CTA) are evaluated in separate JSX branches using duplicated conditions. Hard to follow when both filter conditions change.
- **Recommendation:** Extract an `EmptyStatePanel` sub-component that accepts `{ isFiltered, mapName, gameSlug, mapSlug }` props and consolidates both branches.

---
