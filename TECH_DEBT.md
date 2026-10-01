# MyFreeApps — Tech Debt

Cross-app / shared-package tech debt. Per-app items live in each app's own
`apps/<app>/TECH_DEBT.md`. Ranked by severity.

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

---

## MEDIUM — Inline theme script blocked by CSP in 4 of 6 apps, canonical MBK included

**Logged:** 2026-10-01
**Scope:** `apps/mybookkeeper` (canonical), `apps/mylanguagetutor`, `apps/mypizzatracker`, `apps/myrecipes` (`app.yaml` `csp` + `frontend/index.html`)
**Effort:** Small (~1h: four hashes, re-render, one parametrised conformance test)

### Problem

Every app's `frontend/index.html` has an inline theme-bootstrap `<script>`. It adds
`dark` to `<html>` before React mounts, so dark-mode users don't see a light flash.
Under each app's strict `script-src`, the browser runs it only if its SHA-256 hash
is listed (`rules/inline-script-csp-hashes.md`). Hashing the LF bytes a CI build
serves:

| App | Script hash | Allowed by `script-src`? |
|---|---|---|
| mybookkeeper | `sha256-pRmp+e9Kbp/gMfqkTunUSwQiXg5fOIUXX1ZIdhOiwW8=` | No — lists a stale `sha256-6gP5…` |
| mylanguagetutor | `sha256-5ZdhFxrnnX1Ovg0nAtuU78NThCLbXwy2T09p3sU1V7k=` | No — no hash at all |
| mypizzatracker | same as mylanguagetutor | No — no hash at all |
| myrecipes | same as mylanguagetutor | No — no hash at all |
| myjobhunter | `sha256-6gP5jY9WKtmx3Qr/KXGhyuG+YL86Nf6nSb7wHrV5jmk=` | Yes |
| mygamingassistant | `sha256-5Zdh…` | Yes (fixed in the MGA Discord Activity PR) |

Wherever those four apps' CSP is served, the browser blocks the script on every
page load (a CSP violation in the console), and dark-mode users get a light flash until React's
`useTheme` applies the class. The script's code is the same in all six apps; only
its surrounding whitespace differs, hence three different hashes.

### Recommendation

1. Add the hashes above to each app's `script-src`, canonical MBK first per the
   parity flow, and re-render the Caddyfiles.
2. Generalise
   `packages/shared-backend/tests/test_discord_activity_framing.py::test_mga_inline_theme_script_hash_matches_its_csp`
   into a conformance test over every app with an inline script, so an edit to
   `index.html` fails CI instead of silently breaking the theme.
3. Longer term, render the script from `infra/templates/` (theme bootstrap is
   Tier 2) so every app serves the same bytes under one hash.

---

## MEDIUM — Shared shells keep the previous page's scroll position on navigation

**Logged:** 2026-10-01
**Scope:** `packages/shared-frontend/src/components/layout/AppShell.tsx` + `GuestShell.tsx` (every app)
**Effort:** Small (~1h with a test)

### Problem

Both shells are `h-screen overflow-hidden`, with the page inside
`<main className="flex-1 overflow-y-auto">`. So `<main>` scrolls, not the window.
react-router's `<ScrollRestoration />` (mounted by most apps' RootLayout) only
handles window scroll, and `<main>` stays mounted across route changes. Navigating
from a scrolled page therefore opens the next page at the same offset, e.g. a long
list followed by a detail page that starts half-way down. Found in MGA's Discord
Activity, whose own shell now resets its scroll container on every pathname
change (`apps/mygamingassistant/frontend/src/components/discord/DiscordActivityShell.tsx`).

### Recommendation

In both shells, hold a ref on `<main>` and set `scrollTop = 0` in an effect keyed
on `location.pathname` (not search/hash, so filter changes don't jump). Restoring
the offset on Back would need offsets saved per `location.key`. Add a shell test
that scrolls `<main>`, navigates, and asserts it is back at 0.

---

## LOW — index.html theme scripts read localStorage unguarded

**Logged:** 2026-10-01
**Scope:** every app's `frontend/index.html`
**Effort:** Small; pair it with the CSP-hash item above, since any byte change needs a new hash

### Problem

`localStorage.getItem("v1_theme")` throws a `SecurityError` where storage is
blocked (third-party iframes with third-party storage off, some privacy modes).
The script then stops before applying `dark`, so those users get the light flash.
The MGA Discord Activity PR made the React side safe (`@platform/ui`
`lib/safeStorage.ts`, used by `api.ts`, `auth-store.ts` and `useTheme`), but left
the inline script alone so its CSP hash stays put.

### Recommendation

Wrap the read in `try { … } catch (e) {}` in the same change as the CSP-hash fix,
since the hashes are regenerated then anyway.

---

## LOW — Caddy error responses carry none of the deferred security headers

**Logged:** 2026-10-01
**Scope:** `infra/templates/Caddyfile.docker.j2` (every app's rendered `docker/Caddyfile.docker`)
**Effort:** Small (~1h + a render-conformance assertion)

### Problem

The security headers (HSTS, nosniff, Referrer-Policy, Permissions-Policy,
X-Frame-Options, CSP) are set in `header { defer … }` blocks. Caddy applies
deferred header operations when a handler writes its response, but not to
responses produced by its error handling. Examples are a `file_server` 404 for a
missing `/assets/*` file and a 502 while the API is down. Those responses go out
without any of the headers. Pre-existing for every app; noticed while splitting
MGA's framing headers per handler.

### Recommendation

Add a `handle_errors` block to the template that sets the same headers (the
API's strict pair for `/api/*`, the app's CSP elsewhere) and responds with the
error status. Then assert in the render conformance tests that every rendered
Caddyfile has it.
