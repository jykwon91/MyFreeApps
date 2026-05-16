# MyFreeApps — Tech Debt

Cross-app / shared-package tech debt. Per-app items live in each app's own
TECH_DEBT.md (none yet). Ranked by severity.

---

## HIGH — No boot-time guard for `ANTHROPIC_API_KEY`; canonical app unguarded

**Logged:** 2026-05-16
**Scope:** `packages/shared-backend` (Tier 1/2) + `apps/mybookkeeper` (canonical) + `apps/myjobhunter` + `apps/mypizzatracker` + `apps/mygamingassistant`

### Problem

The shared extraction service (`platform_shared/extraction/service.py:97`) raises
`ExtractionNotConfiguredError` only **at call time** — i.e., when the first user
triggers a Claude-dependent feature in production. There is **no boot-time guard**.
A misconfigured deploy (missing `ANTHROPIC_API_KEY`) passes its healthcheck, rolls
out green, and silently breaks for the first real user instead of failing the
deploy.

Two concrete defects:

1. **Canonical app (MBK) has no guard at all.** `apps/mybookkeeper/backend/app/main.py`
   has zero Anthropic checks. MBK invoice extraction via Claude is a *core* feature
   with no manual fallback. MJH (resume/job analysis) and MPT (extraction via
   `platform_shared.extraction`, PR #665) mirror canonical → same gap. This is the
   exact failure class `rules/pr-operational-migration.md` and the shared lifespan's
   own docstring (`platform_shared/core/lifespan.py:1-23`) exist to prevent
   ("fail loud at boot → healthcheck → deploy rollback").

2. **MGA reimplemented the guard app-locally.** `apps/mygamingassistant/backend/app/main.py:55-100`
   hand-rolls `ClassifierNotConfiguredError` instead of using the shared layer.
   `platform_shared/core/boot_guards.py` has `check_turnstile_configured`,
   `check_email_configured`, `check_sms_configured` — but **no
   `check_extraction_configured`**. Per `rules/monorepo-parity-discipline.md`, a
   guard 2+ apps need is a Tier-1/2 shared primitive; per-app reimplementation is a
   defect, and here the *canonical* app is the one missing it entirely.

Note: MGA's classifier is *intentionally optional* (`ENABLE_CLASSIFIER` flag +
manual review queue fallback). The conditional guard there is correct behavior —
the defect is that it's app-local, not that it's conditional.

### Recommended fix

1. Add `check_extraction_configured(*, anthropic_api_key, extraction_required,
   environment)` to `platform_shared/core/boot_guards.py`, mirroring the existing
   three guards' shape exactly.
2. Wire it into `platform_shared/core/lifespan.py` as the 4th boot guard, gated by
   an `extraction_required` flag threaded through `create_app_lifespan(...)` — same
   pattern as the existing `sms_required`.
3. Per-app declaration: MBK / MJH / MPT → `extraction_required=True`; MGA →
   `extraction_required=settings.enable_classifier` (preserves optional mode).
4. Delete MGA's hand-rolled `ClassifierNotConfiguredError` block in favor of the
   shared guard (removes the parity violation).
5. Add a conformance test (sibling to the existing boot-guard tests) asserting all
   Claude-consuming apps wire the guard.

Fix canonical (MBK) first, then mirror — per the parity correction flow
(canonical weaker than a derived app = "fix canonical first").

### Why not done now

Surfaced 2026-05-16 during MGA Re-classify verification; operator chose to log
rather than implement inline (correctly scoped as a separate cross-app change,
not a drive-by during a verification task).

---

## MEDIUM — MGA frontend: 14 pre-existing lint errors in calibrate/* + ZoneEditPage

**Logged:** 2026-05-16
**Scope:** `apps/mygamingassistant/frontend/src/`
**Effort:** Medium (~2-4h, each pattern fix is mechanical but spread across 8 files)

### Problem

`npm run lint` produces 14 errors (0 warnings) all pre-existing; none introduced
by PR #685. Root causes:

- **`react-hooks/set-state-in-effect`** (13 errors): synchronous `setState` calls
  inside `useEffect` in calibrate components and pages. These can cause cascading
  re-renders (the rule exists for a reason — React 18 strict mode may double-fire
  them). Affected files:
  - `src/components/calibrate/dots/DotColorSwatch.tsx` (line 30)
  - `src/components/calibrate/dots/DotLivePreview.tsx` (line 37)
  - `src/components/calibrate/region/RegionPanel.tsx` (line 57)
  - `src/components/calibrate/zones/ZonesPanel.tsx` (line 72)
  - `src/hooks/useZoneEditorDraft.ts` (line 156)
  - `src/pages/LiveCs2Calibrate.tsx` (lines 137, 545)
  - `src/pages/MapPage.tsx` (line 184)
  - `src/pages/ZoneEditPage.tsx` (lines 81, 89, 98, 115)

- **`react-hooks/cannot-access-before-init`** (1 error): variable accessed before
  declaration in `ZoneEditPage.tsx` (line 151).

- **`react-memo/require-memo`** (1 warning treated as error): memoization could not
  be preserved in `ZoneEditPage.tsx` (line 174).

### Recommendation

Fix file by file in a dedicated cleanup PR. Each `setState-in-useEffect` pattern
should be moved to a derived-state pattern (compute the value during render instead
of syncing it via an effect) or wrapped in a condition that prevents double-firing.
`ZoneEditPage.tsx` needs the declaration-order fix as well.

Do not fix drive-by — these files have complex Tauri-specific interactions and need
focused testing after refactor.
