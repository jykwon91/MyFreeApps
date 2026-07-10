# MyGamingAssistant - Tech Debt Log

> Last scanned: 2026-06-01 (serve-only PR — logged 1 pre-existing test failure + extended the ORM-in-routes entry to include totp.py; prior findings preserved)
> Issues: 0 critical, 6 high, 7 medium, 3 low

mode: log-only - fix only Critical items that block the current feature; log everything else here.

Scope note: MGA is intentionally a single-user, public-read / auth-write app with NO Sentry. Those are locked product decisions. MGA is also dev-only (no prod deploy yet - see memory/project_mga_dev_only_no_prod_deploy.md), so operational-migration concerns are not blocking. The auth-write router-level-guard model is correctly implemented (verified games.py, the lineup route module, lineup_packages.py, sources.py, scheduler.py, test_helpers/router.py).

This scan focuses on the user concern: long production files (700+ LOC). Splits are proposed with concrete file shapes; the existing best-practice findings from the 2026-05-16 scan are preserved.

---

## Critical

(none — see Resolved section)

### [RESOLVED — PR #752/#754/#756/#758] [Size] Classifier - classifier_service.py is a 1967-line god-module: 4 independent Claude pipelines, prompts, parsers, validators in one file

- **Severity:** Critical
- **Category:** size / architecture
- **Effort:** L (4-6 hours)
- **Blocks:** future classifier work (PR3 throw-technique iteration, PR4 game-scoping fix, Valorant onboarding); raises the cost of every change touching prompts; complicates the open High-severity classifier game-scoping refactor (see "[Data / Architecture] Classifier - ingest-time reference data spans ALL games" below) because that work has to land cleanly inside a 1967-line file.
- **Location:** backend/app/services/classification/classifier_service.py (entire file)
- **Problem:** Four completely independent Claude code paths live in one module, each with its own prompt schema, system text, parser, validators, error handling, and gate constants:
  1. classify_lineup (lines 600-918) - re-classify time, single image, slug resolution, DB write.
  2. classify_frames_for_lineup_decision (lines 986-1276) - Strategy A grid classifier at ingest time, N frames, is_lineup decision + best-frame pick, slug resolution.
  3. classify_throw_timing_from_frames (lines 1345-1606) - PR2 release/result frame localizer, no DB, no slug resolution.
  4. classify_throw_technique_from_frames (lines 1726-1967) - PR3 technique footer text, no DB, no slug resolution.

  Plus shared infrastructure interleaved: prompt constants _OUTPUT_SCHEMA_DOC / _GAME_VISUAL_CUES / _GAME_FIRST_RULE / _GRID_OUTPUT_SCHEMA_DOC / _THROW_TIMING_SCHEMA_DOC / _THROW_TECHNIQUE_SCHEMA_DOC / _CS2_TECHNIQUE_VOCAB / _VALORANT_TECHNIQUE_VOCAB / _GENERIC_TECHNIQUE_VOCAB (lines 56-187, 1291, 1626-1716); reference loader _load_reference_data (194-288); reference text builder _build_reference_text (296); slug resolver _resolve_slugs + _slug_failure_code (334-497); cross-game guard _check_game_map_consistency (505-562); screenshot loader _fetch_screenshot_bytes (570-592); parser helpers _strip_json_fences / _validate_aim_coord / _validate_grid_index / _technique_vocab_block (937-983, 1664-1676).

  The four pipelines must evolve independently (frozen design contracts pr2-clip-localization-design.md, pr3-throw-technique-design.md explicitly document non-conflation). Sharing a file conflates them in practice - a prompt edit on one requires re-reading the whole file to confirm nothing else broke. Only callers from outside the module touch the four classify_* public symbols (4 of 30+ defined). Everything else is private.
- **Recommendation:** Split into a classification/ sub-package, keeping classifier_service.py itself as a thin re-export so existing callers and tests do not churn:

```
backend/app/services/classification/
- __init__.py                    # re-export the 4 public callables
- classification_result.py       # (exists)
- classifier_service.py          # thin re-export shim (<=30 lines)
- prompts/
    - __init__.py
    - game_cues.py               # _GAME_VISUAL_CUES, _GAME_FIRST_RULE
    - lineup_schema.py           # _OUTPUT_SCHEMA_DOC, _GRID_OUTPUT_SCHEMA_DOC
    - throw_timing_schema.py     # _THROW_TIMING_SCHEMA_DOC
    - throw_technique_schema.py  # _THROW_TECHNIQUE_SCHEMA_DOC + the 3 _*_TECHNIQUE_VOCAB blocks + _technique_vocab_block()
- reference_data.py              # _load_reference_data + _build_reference_text
- slug_resolver.py               # _resolve_slugs + _slug_failure_code + _check_game_map_consistency
- screenshot.py                  # _fetch_screenshot_bytes
- parsers.py                     # _strip_json_fences, _validate_aim_coord, _validate_grid_index
- lineup_classifier.py           # classify_lineup() (single-image re-classify path; ~320 LOC)
- lineup_grid_classifier.py      # classify_frames_for_lineup_decision() (~290 LOC)
- throw_timing.py                # classify_throw_timing_from_frames() (~260 LOC)
- throw_technique.py             # classify_throw_technique_from_frames() + _TECHNIQUE_CONFIDENCE_GATE (~240 LOC)
```

  Constraints to preserve in the split:
  - classifier_service.py stays as a re-export shim so no caller needs to change. Tests already import from app.services.classification.classifier_service (10+ sites) - they keep working.
  - Anthropic client construction stays inlined in each pipeline (already per-call - no shared client to factor out).
  - Cache-control breakpoints stay identical (system prompt + reference data cached, per-call user content uncached).
  - Each pipeline owns its own retry / rate-limit / parse-failure error handling (today already independent - just move it).

  Outcome: every prompt change is now a <=300-line file edit. The open game-scoping refactor lands in lineup_grid_classifier.py + reference_data.py only, not "somewhere inside 1967 lines."

---

## High

### [Test] MicroClipShiftOverlay - one unit test fails in jsdom (HTMLMediaElement.pause not implemented); the shift mutation is never observed

- **Severity:** High
- **Effort:** S (<1 hour)
- **Category:** test / silent failure
- **Location:** frontend/src/__tests__/MicroClipShiftOverlay.test.tsx:237-241 ("fires the shift mutation with the operator-chosen offset on Apply")
- **Problem:** The test sets the slider to 3.5, clicks "Shift window", and asserts the shift mutation was called once — but jsdom logs "Not implemented: HTMLMediaElement's pause()" and the mutation spy records 0 calls, so the assertion fails. Pre-existing (fails in isolation on a clean tree; unrelated to the 2026-06-01 serve-only work). Either the component's Apply handler throws before dispatching the mutation when `video.pause()` raises in jsdom (a real bug that would also break the operator's Apply click), or the test fails to stub `HTMLMediaElement.prototype.pause` the way LineupListRow.test.tsx does. The "0 calls" hides which.
- **Recommendation:** First determine whether the component swallows a `pause()` exception before dispatch (real bug — wrap the pause in a guarded call and still dispatch) or whether it's purely a missing jsdom stub (test bug — add the `HTMLMediaElement.prototype.pause`/`play` stub in a `beforeEach`, mirroring LineupListRow.test.tsx). Fix the cause, not the assertion. This was NOT fixed during the serve-only PR to keep that change scoped (the failure is in the clip-shift domain, unrelated to auth).

### [Architecture] Lineup Library - ORM/DB access in route handlers (CLAUDE.md never-import-ORM-in-routes violated in 2 modules)

- **Severity:** High
- **Effort:** M (2-4 hours)
- **Category:** architecture
- **Location:** backend/app/api/games.py:24-26,64,84-90,111-126,210-211,237,248; backend/app/api/lineups.py:38,84-94,130-165,240-246,282-285; backend/app/api/totp.py:67,88,130,142,153,170,194 (db.add/flush/commit/execute in the TOTP route handlers — same violation; surfaced 2026-06-01 by the serve-only quality gate)
- **Problem:** MGA CLAUDE.md mandates Routes -> Services -> Repositories; never import ORM/DB in route handlers. These modules import select / AsyncSession / selectinload and run raw db.execute(select(...)) plus db.flush() / db.commit() / db.add() directly in handlers. games.py list_games / list_maps / get_map build queries inline, confirm_minimap_upload does db.flush()+db.commit() (210-211), update_map_zones does db.commit() (248); the lineup route module _resolve_map / list_lineups / list_pending_lineups / get_zone_density resolve Game / Map / Zone / UtilityType slugs via inline db.execute(select(...)). Same class of layering erosion that produced the silent PATCH-rollback bug recorded in lineup_service.py history. The slug-to-ID resolution logic is duplicated across games.py, the lineup route module, and classifier_service._resolve_slugs - three copies.
- **Note:** The previous scan recorded this as resolved for the commit/mutation half (Layering audit finding #3 RESOLVED below). The read-side inline select(...) queries are still present and the slug-resolver duplication is unaddressed.
- **Recommendation:** Extract a shared resolver game_repo.resolve_slugs_to_ids(db, *, game_slug, map_slug, zone_slugs, utility_type_slugs) that returns the FK tuple. Replace the inline select() blocks in the lineup route module and in api/games.py with calls into game_repo (helpers already exist - get_game_by_slug, get_map_detail). Drop the SQLAlchemy select import from both route modules. The classifier _resolve_slugs is allowed to keep its own copy for now since it returns extra diagnostic structure (failures + structured codes) - but make it call the shared FK lookups for the actual queries, deduplicating the 3-way fan-out.

### [RESOLVED — this PR] [Size] Lineup Repository - lineup_repo.py is 873 lines: clip writers stamp out the same 4-line set-column-commit-rollback pattern 8 times

- **Severity:** ~~High~~ → RESOLVED. Split into the proposed `lineup/` subpackage; `lineup_repo.py` is now a 74-line re-export shim. Leaf modules: `filters.py` (43), `lifecycle.py` (262), `throw_pane.py` (208), `landing_pane.py` (155), `micro_panes.py` (185), `technique.py` (76), `density.py` (58). All 25 caller sites preserved (no churn). 676/676 backend tests green.
- **Effort:** M (3-4 hours)
- **Category:** size / architecture
- **Blocks:** PR5 trim feature work, PR6 micro-clip iteration; raises noise floor of the file the layering-finding-#3 PR uses as canonical commit-ownership pattern.
- **Location:** backend/app/repositories/game/lineup_repo.py (873 lines, 28 functions)
- **Problem:** The repo has 28 async functions split across roughly seven concerns. Eight of them (set_clip_url, set_clip_url_original, set_clip_url_trim, set_landing_clip_url, set_landing_clip_url_original, set_landing_clip_url_trim, set_stand_clip_url, set_aim_clip_url) follow byte-for-byte the same shape: assign 1-3 columns, flush -> commit -> except rollback raise. Two more (set_stand_screenshot_url, set_aim_screenshot_url) and set_technique (827) follow the identical shape. The pattern is GOOD (commit ownership belongs in the repo), but copy-paste means a future change to commit semantics has 11 sites to update.

  Three additional concerns mix in:
  - Lineup lifecycle (create_lineup, get_lineup, update_lineup, hide_lineup, accept_lineup, commit_classifier_run - lines 79-298).
  - Filter + density read paths (LineupFilters dataclass + _apply_filters + list_lineups + zone_density - 24-53, 104-122, 827-873).
  - Backfill list-queries (list_accepted_lineups_needing_clips/landing_clips/widen_source/micro_clips/technique - 300, 442, 578, 626, 767). Five mostly-similar find rows missing column X SELECTs.
- **Recommendation:** Split into the per-pane shape that mirrors the four-pane storyboard the column set already encodes:

```
backend/app/repositories/game/
- lineup_repo.py                  # thin re-export of all public symbols (preserves ~10 import sites)
- lineup/
    - __init__.py                 # re-export everything for back-compat
    - filters.py                  # LineupFilters dataclass + _apply_filters
    - lifecycle.py                # create_lineup, get_lineup, list_lineups, update_lineup,
                                  # hide_lineup, accept_lineup, commit_classifier_run,
                                  # write_classifier_suggestions, get_ingested_video_ids,
                                  # list_pending_lineups, _refresh_set_relations (~280 LOC)
    - throw_pane.py               # list_accepted_lineups_needing_clips + set_clip_url /
                                  # set_clip_url_original / set_clip_url_trim +
                                  # list_accepted_lineups_needing_widen_source (~170 LOC)
    - landing_pane.py             # list_accepted_lineups_needing_landing_clips +
                                  # set_landing_clip_url / _original / _trim (~150 LOC)
    - micro_panes.py              # list_accepted_lineups_needing_micro_clips +
                                  # set_stand_clip_url / set_aim_clip_url +
                                  # set_stand_screenshot_url / set_aim_screenshot_url (~150 LOC)
    - technique.py                # list_accepted_lineups_needing_technique + set_technique (~70 LOC)
    - density.py                  # zone_density (~50 LOC)
```

  Optional follow-up (NOT required for the split): factor the repeating flush -> commit -> except rollback raise block into a _commit_one_column(db, lineup, **updates) helper. Worth doing only when a future change needs to touch all 11.

  Constraint to preserve: the one-column commit boundary (each setter owns its own commit). Do not refactor to a shared do these N column updates in one txn - the clip failure must NOT roll back the lineup/classifier guarantee in the existing docstrings is the whole point.

### [Size] Ingestion Orchestrator - _process_chapter is 332 lines (lines 207-536); PR2/PR3/PR5/PR6 best-effort blocks are stamped out 4 times

- **Severity:** High
- **Effort:** M (2-3 hours)
- **Category:** size / architecture
- **Blocks:** future ingest extension (new best-effort generators), readability of the success path that drives every chapter
- **Location:** backend/app/services/ingestion/ingestion_orchestrator.py:207-536
- **Problem:** _process_chapter does the full happy-path inline:
  1. Frame extraction (243-258)
  2. Classifier call with disabled-fallback (270-326)
  3. MinIO upload (334-344)
  4. DB insert + classifier writeback (358-380)
  5. PR2 clip generation (400-425) - best-effort try/except block
  6. PR5 landing-clip generation (436-467) - best-effort try/except block
  7. PR6 stand/aim micro-clip generation (476-499) - best-effort try/except block
  8. PR3 technique extraction (509-534) - best-effort try/except block

  Steps 5-8 are structurally identical: log start, try await generate_X(...) log result except log non-fatal warning. The next best-effort generator (eventually a PR7 or some new pane) lands by copy-pasting this fifth time. Adding a single new generator is a 30-line touch.

  Wrapping function _process_video (539-646) is fine - it is the per-video lifecycle. sync_source (649-735) is fine - it is the top-level lifecycle. The bloat is concentrated in _process_chapter.
- **Recommendation:** Extract a small ChapterPostProcessor (or just module-level helpers) that drives the best-effort generators uniformly:

```
backend/app/services/ingestion/chapter_post_processors.py
  async def run_clip_pipeline(db, lineup, *, chapter, video_path, classifier_result)
  async def run_landing_clip(db, lineup, *, chapter, video_path, clip_result)
  async def run_micro_clips(db, lineup, *, chapter, video_path, stand_ts, aim_ts)
  async def run_technique(db, lineup, *, chapter, video_path, game_slug)
```

  Each one owns the try/except + structured-log seam. _process_chapter becomes ~120 lines that calls them in sequence.

  Resist a declarative list pattern: PR5 landing only fires when PR2 clip succeeded; PR6 micro fires regardless. The conditionality is real; keep it readable.

### [Data / Architecture] Classifier - ingest-time reference data spans ALL games; cross-game zone bleed (root cause of CS2/Valorant misclassification)

- **Severity:** High
- **Effort:** M (2-4 hours)
- **Category:** data / architecture
- **Location:** backend/app/services/classification/classifier_service.py:948 (_load_reference_data(db, game_id=None)), _build_reference_text (291), _check_game_map_consistency (441), _resolve_slugs (329)
- **Problem:** At ingest time there is no lineup.game_id yet, so classify_frames_for_lineup_decision loads the reference block for every game (line 948) and game_hint only narrows the prompt textually (Expected game: cs2) - not a hard constraint. Claude is shown CS2 Mirage zones AND Valorant Ascent market/window zones in the same prompt; a CS2 Mirage screenshot can return tagged with Valorant zone slugs. The _check_game_map_consistency guard only catches game/map slug mismatch (and only if Claude self-reports the right game_slug); a within-the-wrong-game zone slug that does not resolve produces a silent suggested_target_zone_id=None. The failure is recorded only as free text appended to classification_reasoning - no structured/queryable signal, so the operator misclassification problem has no observability surface beyond reading prose per-card.
- **Recommendation:** (1) When game_hint is a known game slug, resolve it to a game_id and pass it to _load_reference_data so the prompt only contains that game maps/zones - a hard scope, not a textual hint. Keep the all-games path only when game_hint is absent/unknown. (2) Persist a structured classification-diagnostics field (e.g. classification_unresolved list or a small JSON column) capturing which slugs failed to resolve, so the review queue can filter lineups-with-unresolved-zones instead of scanning reasoning text. Directly attacks the cited misclassification + diagnostic-black-hole pair. Lands cleanly in the new lineup_grid_classifier.py + reference_data.py once the Critical split is done.

### [Data] Lineup Library - CS2 Mirage zone set incomplete vs callouts the classifier emits (market/window/granular-mid absent)

- **Severity:** High
- **Effort:** M (1-3 hours)
- **Category:** data
- **Location:** backend/app/fixtures/cs2_maps.json (mirage: 10 zones), backend/app/fixtures/_apply_cs2_polygons.py:33-44
- **Problem:** Mirage fixture has exactly a-site, a-palace, a-ramp, catwalk, mid, b-site, b-van, b-apts, t-spawn, ct-spawn. Missing common Mirage callouts real lineup videos chapter on - connector, window, top-mid, jungle, stairs, firebox, tetris, underpass. market/window are Valorant-Ascent slugs that, combined with the all-games reference bleed (High item above), the classifier emits for CS2 Mirage - they fail slug resolution silently. Other CS2 maps reference a-main/b-main (Anubis, Ancient) but Mirage/Inferno/Dust2 lack the granular mid/connector callouts creators use as chapter titles. Result: many ingested CS2 lineups land with suggested_target_zone_id=NULL, unacceptable without manual zone assignment.
- **Recommendation:** Expand cs2_maps.json per-map zone sets to cover the standard pro callout vocabulary (cross-reference a canonical CS2 callout map per map). Add new zones to _apply_cs2_polygons.py POLYGONS table so they ship with seed geometry (the helper already reports UNMATCHED/UNUSED - use it to verify parity between JSON zone list and polygon table). Pair with the classifier game-scoping fix so Valorant slugs can no longer leak into CS2 classifications.

### [Architecture] Sources / Ingestion - db.commit() in the service layer (commits belong in repositories)

- **Severity:** High
- **Effort:** M (1-3 hours)
- **Category:** architecture
- **Location:** backend/app/services/game/source_service.py:84,102; backend/app/services/ingestion/ingestion_orchestrator.py:307,475,506
- **Problem:** The commit/rollback boundary belongs in the repository layer. source_service.create (db.commit()+db.refresh() 84-85) and source_service.delete (db.commit() 102) commit in the service; source_repo.create_source and soft_delete_source only flush(), pushing the commit up - the inverse of lineup_repo. ingestion_orchestrator._process_chapter (307), sync_source (475,506) also commit in a service module.
- **Note:** Previously partially resolved as Layering audit finding #3 below (record_sync_stats moved). The remaining db.commit() calls cited above are still present per the current code.
- **Recommendation:** Move commit ownership fully into source_repo (create_source, soft_delete_source each flush -> commit -> rollback-on-error, matching lineup_repo.create_lineup). The orchestrator is a coordinator, not a route - its commit is more defensible, but for consistency push the per-chapter row commit into a lineup_repo finalizer (already done via commit_classifier_run; verify no orchestrator-level db.commit() remains).

---

## Medium

### [Infra] Unify media routing — migrate myfreeapps.org zone to Cloudflare + bind mga-clips as an R2 custom domain

- **Severity:** Medium
- **Effort:** L (operator-driven: Cloudflare + Porkbun dashboards; risk touches all apps)
- **Category:** infra / serving
- **Location:** apps/mygamingassistant/backend/.env.docker (MINIO_PUBLIC_BASE_URL); apps/mygamingassistant/app.yaml (CSP already allows both hosts)
- **Deferred:** 2026-07-10, by operator ("defer the work to unify routing to the backlog").
- **Problem:** Prod currently serves lineup clips via PRESIGNED R2 URLs (`*.r2.cloudflarestorage.com`) because `MINIO_PUBLIC_BASE_URL` is empty. This is correct and works, but bypasses Cloudflare's edge cache — the original reason R2 was chosen for a public read-heavy library. The intended CDN mode (plain `{base}/{key}` via `mga-clips.myfreeapps.org`) needs that domain bound as an R2 custom domain, which needs the `myfreeapps.org` DNS zone on Cloudflare. It is on **Porkbun** (`*.ns.porkbun.com`), so binding is impossible without migrating the whole zone. Setting `MINIO_PUBLIC_BASE_URL` to the unbound domain is what caused the 2026-07-10 incident (every clip NXDOMAIN while /health stayed green).
- **Recommendation:** When/if edge caching is wanted: repoint `myfreeapps.org` nameservers Porkbun → Cloudflare, re-create every existing DNS record (all app subdomains + MX/email — one miss = downtime), bind `mga-clips.myfreeapps.org` as an R2 custom domain, then set `MINIO_PUBLIC_BASE_URL=https://mga-clips.myfreeapps.org` on the VPS. The boot guard (`app/main.py _check_media_public_base_url_resolvable`) and deploy media tripwire will then verify the CDN host serves before the deploy is declared green. Low urgency: presigned mode is fully functional and R2 egress is free regardless; this only buys edge caching, marginal for a low-traffic app.

### [Size] LiveCs2Calibrate - 658-line page mixes URL state, dirty-leave guard, keyboard shortcuts, screen capture, three sub-panels

- **Severity:** Medium
- **Effort:** M (2-3 hours)
- **Category:** size / frontend
- **Location:** frontend/src/pages/LiveCs2Calibrate.tsx (658 lines)
- **Problem:** The page top-level component owns:
  - URL state for ?map, ?res, ?section (lines 56-58, 152-198)
  - Resolution auto-detect via Tauri (85-110)
  - aria-live debouncer (113-122)
  - Dirty-leave guard via useBlocker + beforeunload (124-149)
  - Save/reset section handlers (200-235)
  - Global keyboard shortcuts (237-280)
  - Section dispatch to Region/Zones/Dots panels (469-526)
  - Embedded sub-components useCroppedSnapshot hook (537-586), ShortcutsModal (588-650), Kbd (652-657)

  Many concerns are reusable. useCroppedSnapshot is a hook that could be consumed by other minimap-cropping UIs. ShortcutsModal + Kbd are generic. The dirty-leave guard pattern is repeated in ZoneEditPage (verified - both useBlocker users).
- **Recommendation:** Extract three files:

```
frontend/src/pages/LiveCs2Calibrate.tsx          # now ~300 LOC - orchestration only
frontend/src/hooks/useCroppedSnapshot.ts          # the canvas-crop hook
frontend/src/hooks/useDirtyLeaveGuard.ts          # useBlocker + beforeunload (also used by ZoneEditPage)
frontend/src/components/ui/ShortcutsModal.tsx     # generic - Kbd component co-located
```

  Section dispatch (lines 469-526) is fine inline - it is small and stays readable as a switch.

### [Size] ReviewCard - 627 lines: form-state helpers + 7-field cascading select grid + minimap pin editor wiring + 3 mutations

- **Severity:** Medium
- **Effort:** M (2-3 hours)
- **Category:** size / frontend
- **Location:** frontend/src/components/review/ReviewCard.tsx
- **Problem:** Single file holds:
  - ClassificationFields interface (41-57) + initFieldsFromLineup + fieldsToAcceptBody + placeholderLabel (59-121).
  - ReviewCard component (133-627) which itself has the cascading-select grid (392-544) duplicated almost verbatim with the form in LineupUpload.tsx:282-419 - game -> map -> zones -> utility cascade with parent-blocked placeholders.
  - Three mutation handlers (handleAccept, handleHide, handleReclassify) at 201-249.
  - Minimap-pin wiring (354-389), screenshot anchor wiring (297-350).

  Two reusable pieces are hiding: the cascading-select grid GameMapZoneUtilitySelector and the ClassificationFields state model.
- **Recommendation:** Extract a shared form primitive:

```
frontend/src/components/lineup/
- GameMapZoneUtilitySelector.tsx   # the cascading selects + dependent placeholders
                                   # (used by ReviewCard + LineupUpload + zone editors)
- classificationFields.ts          # ClassificationFields type + initFieldsFromLineup +
                                   # fieldsToAcceptBody + placeholderLabel
```

  Then ReviewCard shrinks to ~350 LOC (header / screenshots / minimap pin editor / mutation handlers / action buttons). LineupUpload shrinks correspondingly. The duplicate cascade logic disappears in one PR.

### [Size] LineupUpload - 547 lines: upload state + presigned URL handling + form rendering all inline

- **Severity:** Medium
- **Effort:** S (1-2 hours)
- **Category:** size / frontend
- **Location:** frontend/src/pages/LineupUpload.tsx
- **Problem:** Single default export component owns: react-hook-form wiring (43-99); two parallel screenshot upload pipelines (137-214) with duplicated progress / XHR / key-tracking state; aim-anchor click handler (217-227); submit logic (229-260); object-URL leak prevention (110-135); and a 250+ line render block (277-545) including a hand-rolled image-preview-with-anchor that duplicates the same logic in ReviewScreenshot.

  The duplicated screenshot pipeline (uploadScreenshot helper + parallel state pairs standFile/aimFile, standProgress/aimProgress, standUploading/aimUploading, standKey/aimKey) is the costliest part. A custom hook useScreenshotUpload would collapse 80 LOC of state to 4 lines.
- **Recommendation:** Extract one hook + one component:

```
frontend/src/hooks/useScreenshotUpload.ts  # encapsulates file/progress/uploading/key state +
                                           # uploadScreenshot helper. Returns { file, progress,
                                           # uploading, key, handleFiles, reset }.
frontend/src/components/lineup/ScreenshotUploadPreview.tsx
                                           # rendering for either dropzone or preview-with-status.
                                           # Optional aim-anchor click overlay via prop.
```

  LineupUpload shrinks to ~320 LOC. Also opens up upload reuse for future single-file upload surfaces (channel minimap, source thumbnail, etc.).

### [Size] api/lineups.py - 614 lines: 14 route handlers across public + auth routers + 4 pane sub-domains

- **Severity:** Medium
- **Effort:** M (1-2 hours)
- **Category:** size / architecture
- **Location:** backend/app/api/lineups.py
- **Problem:** 14 endpoints in one file with two routers (public_router, auth_router) and four distinct response groups: lineup CRUD (117-441), bulk-accept (443-498), pane upload/confirm (506-545), pane trim (559-578), pane widen-source (590-614). The pane endpoints are an obvious split - they are operator-only, share the same Pane enum, route through three dedicated services (pane_upload_service, pane_trim_service, pane_widen_source_service), and exist as a coherent feature set introduced in PRs #720/#724/#726/#727/#728.

  At 614 LOC the file is still navigable, but the pane endpoints are the natural fault line. Splitting them out unblocks the ongoing widen-source PR2 work without bloating the file further.
- **Recommendation:** Lift the pane endpoints into a sibling route module:

```
backend/app/api/
- lineups.py            # CRUD + bulk-accept + classify (lineups.py now ~410 LOC)
- lineup_panes.py       # pane upload-url / confirm / trim / widen-source
                        # both public_router + auth_router exported
```

  Mount in main.py next to lineups.py. Keep the same prefix; routes still respond at /api/lineups/{id}/panes/... . Repeat the auth_router pattern from the existing module.

### [Size] micro_clip_generator / landing_clip_generator / clip_generator - three near-identical generators (~530 LOC each) with the same shape

- **Severity:** Medium
- **Effort:** M (3-4 hours)
- **Category:** size / architecture
- **Location:** backend/app/services/ingestion/micro_clip_generator.py (545); landing_clip_generator.py (544); clip_generator.py (495)
- **Problem:** Each file has the same skeleton:
  - XGenerationResult dataclass
  - pending_X_key(video_id, chapter_start) + pending_X_source_key(...)
  - _compute_X_bounds(...)
  - generate_X_for_lineup(...) - orchestrate classifier (PR2 path) or skip (PR5/6 path) + download + cut + upload + persist
  - _cut_upload_persist(...) (PR2/PR5) or _cut_upload_persist_one_side (PR6, twice for stand+aim)

  The download video -> ffmpeg cut -> MinIO upload -> repo write core is duplicated three times with slight variations on what timestamp(s) come from the classifier vs are passed in pre-computed. The result is ~1600 LOC of mostly-shared scaffolding.

  Each generator legitimately differs in (a) what column(s) it persists, (b) whether it makes its own Claude call or accepts pre-computed timestamps, (c) bounds-computation rules (PR2 uses release/result frames; PR5 uses post-result; PR6 uses point-anchored micro-windows). These are real differences. The scaffolding around them - error coding, structured logging, video-download contract, ffmpeg-cut contract, MinIO upload - is shared.
- **Recommendation:** Extract the scaffolding into a small clip_pipeline helper:

```
backend/app/services/ingestion/clip_pipeline.py
  @dataclass GenerationContext              # video_path, chapter, lineup, storage, logger seam
  async def download_or_reuse(...)          # the video on disk? reuse : yt-dlp download gate
  async def cut_and_upload(ctx, *, bounds, key) -> CutResult  # ffmpeg + MinIO
  # Each generator _cut_upload_persist now collapses to:
  #   cut = await cut_and_upload(ctx, bounds=bounds, key=key)
  #   await lineup_repo.set_X_url(db, lineup, cut.key)
```

  Per-generator file shrinks to ~250 LOC. _compute_X_bounds stays per-file (truly different math). XGenerationResult stays per-file (different shape). Do not over-abstract - leave each generator as a recognisable single-purpose file.

  Lower-priority alternative if appetite is small: leave the three files as-is and just rename _cut_upload_persist to _cut_upload_persist_<column> so the duplication is at least labelled.

### [Data] Ingestion - Source soft-delete is config_json[deleted], not a deleted_at column

- **Severity:** Medium
- **Effort:** Low (1-2 hours)
- **Location:** backend/app/repositories/game/source_repo.py:32-33,67-87; backend/app/services/scheduling/scheduler_service.py:201-209
- **Problem:** soft_delete_source sets config_json[deleted]=True inside the JSON blob. list_sources filters it in Python (_is_deleted), the scheduler re-implements the same config.get(deleted) is True check (scheduler_service.py:203), SourceRead exposes the deleted key in config_json to clients, and there is no timestamped audit of when the delete happened. The flag-in-JSON pattern is duplicated across repo + scheduler - a 3rd reader will re-duplicate it. Standing debt carried from the previous scan; still open.
- **Recommendation:** Add deleted_at: Mapped[datetime|None] to the Source model + an Alembic migration. Update soft_delete_source to set the timestamp, _is_deleted/list_sources/get_source/scheduler to test the column, SourceRead to omit deleted from config_json (expose a clean deleted_at field). Matches the monorepo schema convention (soft-delete via a real column).

### [UX] Sources - manual sync has no job-status surface; completion inferred by polling last_synced_at

- **Severity:** Medium
- **Effort:** M (3-5 hours)
- **Category:** UX
- **Location:** backend/app/api/sources.py:99-130 (synthetic job_id never persisted); frontend/src/pages/Sources.tsx:28-29,300-347 (5s poll, 5min cap)
- **Problem:** POST /api/sources/{id}/sync returns a synthetic job_id never stored. The frontend cannot poll job status; it captures last_synced_at at kick time and polls GET /sources until it changes or a 5-minute deadline elapses, then says still-running-refresh-later. For a large playlist the operator gets an ambiguous terminal state (slow, or failed?). The UX is honest about the ambiguity (good - no faked state) but the capability gap remains. Carried from previous scan; still open.
- **Recommendation:** When the APScheduler job store is upgraded (or add a lightweight sync_jobs table), persist manual-sync requests with status=running/completed/failed + stats, expose GET /api/sources/{id}/sync-status. Frontend then shows a determinate progress/result instead of a timeout guess.

---

## Low

### [Architecture] Schemas - lineup_schemas.py is a 13-class catch-all (381 LOC) - Pydantic forms, response shapes, validators all inline

- **Severity:** Low
- **Effort:** S (1-2 hours)
- **Category:** size / architecture
- **Location:** backend/app/schemas/game/lineup_schemas.py (381 LOC, 13 BaseModel classes)
- **Problem:** Source-schema misfiling from the previous scan is RESOLVED - source_schemas.py now exists with SourceCreate/SourceRead/SyncJobResponse. The remaining 13 classes cluster into three groups:
  - Read shapes (~150 LOC): ZoneRead, UtilityTypeRead, LineupRead (the big one with computed_field effective-anchor logic at 108-157).
  - Create / update / accept bodies (~100 LOC): LineupCreate, LineupIngestCreate, LineupPatch, UploadUrlResponse, LineupAcceptBody.
  - Bulk + review (~130 LOC): BulkAcceptBody, BulkAcceptSkip, BulkAcceptResult, ClassifyResponse, PendingLineupsResponse.

  No correctness bug - just discoverability. CLAUDE.md says one-schema-per-file but tightly-coupled request/response pairs are pragmatic exceptions; the real seam is the three groups above.
- **Recommendation:** Optional split into three files only if growth continues:

```
backend/app/schemas/game/
- lineup_read_schemas.py        # ZoneRead, UtilityTypeRead, LineupRead + computed-field helpers
- lineup_mutation_schemas.py    # LineupCreate, LineupIngestCreate, LineupPatch, LineupAcceptBody, UploadUrlResponse
- lineup_review_schemas.py      # BulkAccept*, ClassifyResponse, PendingLineupsResponse
```

  Lowest priority. The file is navigable; this is only worth doing as a follow-up to other lineup-domain refactors.

### [Architecture] TOTP route - db.commit() in api/totp.py (monorepo-wide pattern, mirrors canonical)

- **Severity:** Low
- **Effort:** M (cross-app - coordinate with canonical)
- **Location:** backend/app/api/totp.py:67,88,130,142,153,170,194
- **Problem:** api/totp.py commits directly in route handlers (after log_auth_event). Violates MGA layering - but it is a byte-faithful mirror of canonical: MBK api/totp.py same commits at 129/141/152/171/197, MJH at 103/132/187/199/213/232/257. Per monorepo parity discipline, fixing this in MGA alone would create drift; canonical must be corrected first and mirrored forward. Flagged so it is tracked, not silently accepted.
- **Recommendation:** Do NOT fix in MGA in isolation. Raise as a canonical-correction item: the auth-event commit should move into a log_auth_event-owning boundary in platform_shared (or the auth-event service), then mirror the corrected pattern into all three apps in one sweep. Until then, accepted parity debt.

### [Frontend] Bundle - single ~645 KB JS chunk (no code-splitting)

- **Severity:** Low
- **Effort:** M (2-4 hours)
- **Location:** frontend/vite.config.ts
- **Problem:** Vite emits one ~645 KB (206 KB gzip) bundle. Grows with the app; hurts first paint on slow links. Carried from previous scan; still open.
- **Recommendation:** Add build.rollupOptions.output.manualChunks to split react-router / redux / lucide-react, or React.lazy() + Suspense at route level (the heavy LiveCs2* calibration pages are good split points - large and off the main path).

### [Backend tests] Lineup / LineupPackage / sources tests require a running PostgreSQL

- **Severity:** Low
- **Effort:** Low (1-2 hours)
- **Location:** backend/tests/test_lineups.py, backend/tests/test_lineup_package_service.py, backend/tests/test_sources.py
- **Problem:** The auth_client fixture needs a live Postgres (port 5435). DB-dependent tests are silently skipped when none is running - CI cannot tell it is not running them. Carried from previous scan; still open.
- **Recommendation:** Add a pytest-docker / docker-compose fixture (mirror MBK CI) or a conftest.py skipif that emits a loud explicit skip reason so a skipped DB suite is visible, not silent.

---

## Resolved (this scan)

- ~~Source schemas misfiled in lineup_schemas.py~~ - backend/app/schemas/game/source_schemas.py now exists with SourceCreate/SourceRead/SyncJobResponse; lineup_schemas.py no longer holds them. Verified via ls schemas/game/.
- ~~Classifier - invalid confidence from Claude silently dropped (except: pass)~~ - verified resolved: classifier_service.py:1917-1924 (technique path) now does logger.warning(... invalid confidence value dropped ...) and emits a structured invalid_confidence:raw code. The grid + single-image paths also log + emit structured codes for non-numeric confidence rather than swallowing.
- ~~Diagnostics - failed zone slug resolution only surfaces as appended reasoning prose~~ - verified resolved: _slug_failure_code emits unresolved_slug:field:slug:game= per slug and _check_game_map_consistency emits cross_game_rejected:... (lines 334-344, 546-550). Both flow into ClassifyResponse.error_codes. Operator can now filter on structured codes, not prose.
- ~~[Critical] Classifier - classifier_service.py 1967-line god-module~~ — RESOLVED by PRs #752/#754/#756/#758. The four Claude pipelines split into sibling modules: `grid_classifier.py`, `single_image_classifier.py`, `throw_timing_classifier.py`, `throw_technique_classifier.py`. `classifier_service.py` shrank to 319 LOC as a thin re-export shim. Both MGA allowlist entries in `scripts/file-size-allowlist.yml` cleared (only Tauri `pipeline.rs` remains, due to Rust cross-module state constraints).
- ~~[High] lineup_repo.py 873-line repo with 11 copy-pasted set-column-commit blocks~~ — RESOLVED by this PR. Split into the `lineup/` subpackage along 4-pane fault lines: `filters.py` / `lifecycle.py` / `throw_pane.py` / `landing_pane.py` / `micro_panes.py` / `technique.py` / `density.py`. `lineup_repo.py` is now a 74-line re-export shim; 25 call sites preserved. 676/676 backend tests green.

---

## Carried-forward layering finding (kept for history)

### [Backend] Layering audit finding #3 - db.commit/mutation out of routes & services RESOLVED (commit/mutation half only)

- **Resolved:** All db.commit() / db.flush() / raw ORM mutation calls in the listed scope were
  relocated out of route handlers and service files into the repository layer /
  unit_of_work(), per the MGA Routes -> Services -> Repositories; never import ORM/DB in
  route handlers rule and the PR #687 precedent. Touched: api/games.py (now thin -
  reads via game_repo, minimap/zone writes via map_service -> game_repo-owned
  commit), api/lineup_packages.py + lineup_package_service.py (commit boundary moved
  into the service via unit_of_work()), api/sources.py + source_service.py
  (unit_of_work()), ingestion_orchestrator.py (commits delegated to
  lineup_repo.commit_classifier_run + new source_repo.record_sync_stats).
  totp.py deliberately excluded (canonical-mirrored debt - see entry above).
- **Re-opened:** The read-side inline select(...) queries in api/lineups.py and api/games.py,
  plus the duplicated slug-to-ID resolution logic in classifier_service._resolve_slugs,
  remain open as the High-severity ORM/DB access in route handlers finding above.

---

## Glance-board polish (deferred from PR1 code review - 2026-05-17)

Stylistic items flagged in the glance-board PR1 review and intentionally deferred per log-only policy.

### [Frontend] GlanceBoardMinimapSidebar - IIFE tooltip pattern in JSX

- **Severity:** Low
- **Location:** frontend/src/components/lineup/GlanceBoardMinimapSidebar.tsx (hover tooltip rendered via an IIFE inside JSX)
- **Problem:** IIFE inside JSX is non-idiomatic and lint-unfriendly. The hover state belongs in a small sub-component (ZoneTooltip) or early-return variable so the return is clean.
- **Recommendation:** Extract tooltip into a ZoneTooltip sub-component in the same file.

### [Frontend] GlanceBoardOperatorMenu - two mergeable useEffects

- **Severity:** Low
- **Location:** frontend/src/components/lineup/GlanceBoardOperatorMenu.tsx (two separate useEffect blocks both gated on open)
- **Problem:** Both effects depend solely on open and could share one useEffect with two event-listener registrations and a single cleanup. Minor readability/lint friction.
- **Recommendation:** Merge into one useEffect with both addEventListener / removeEventListener calls in the same block.

### [Frontend] MapPage - MessageChannel deferral for setActiveCardIndex

- **Severity:** Low
- **Location:** frontend/src/pages/MapPage.tsx (MessageChannel pattern inside useEffect for setActiveCardIndex(0))
- **Problem:** The MessageChannel deferral is a non-obvious pattern. A plain useEffect with setActiveCardIndex(0) inside satisfies the react-hooks/exhaustive-deps rule; the deferral adds complexity without observable benefit at this call site.
- **Recommendation:** Replace MessageChannel deferral with a direct setActiveCardIndex(0) call in the useEffect body.

### [Frontend] MapPage - fragmented empty-state logic

- **Severity:** Low
- **Location:** frontend/src/pages/MapPage.tsx (two separate empty-state conditions in the main scroll area - filtered-empty ternary and the below-board CTA)
- **Problem:** The two empty-state render paths (filtered empty + no-filters CTA) are evaluated in separate JSX branches using duplicated conditions. Hard to follow when both filter conditions change.
- **Recommendation:** Extract an EmptyStatePanel sub-component that accepts isFiltered, mapName, gameSlug, mapSlug props and consolidates both branches.

---

## Suggested Agent Update

When auditing long files, distinguish between bloat (god-modules where unrelated concerns share a file) and scaffolding duplication (parallel files repeating a 4-line pattern N times). The latter looks like several files of legitimate size, but the total surface area is the real cost. For MGA clip generators (3 files, ~530 LOC each), each file is individually defensible - the cumulative duplication is what justifies extracting a clip_pipeline helper. A future audit pass should report aggregate scaffolding cost when N>=3 sibling files share a structural skeleton, not just per-file LOC. Consider adding scaffolding cluster detection to the long-files pass: if N files in the same directory share roughly 70 plus of their top-level function shape, flag the cluster.
