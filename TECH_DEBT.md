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
   ("fail loud at boot → the deploy's health check fails").

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

## LOW — Theme bootstrap script is copy-pasted per app, not rendered

**Logged:** 2026-10-01
**Scope:** every app's `frontend/index.html`
**Effort:** Small

### Problem

The inline theme-bootstrap `<script>` is Tier 2 but lives as a hand-copied block in
each `index.html`. Five apps now carry byte-identical bytes under one CSP hash
(`sha256-pRmp…`), and `test_inline_script_csp_hashes.py` fails CI if any app's
script and `script-src` disagree. Nothing stops the copies drifting apart again,
though; MGA already differs (it keeps comments, hash `sha256-5Zdh…`).

### Recommendation

Render the script and its hash from `infra/templates/` so every app serves the
same bytes and the hash is computed, not maintained.

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

## MEDIUM — Per-app CI workflows are hand-written; `new_app` creates none

**Logged:** 2026-11-06
**Scope:** `.github/workflows/ci-<app>.yml`, `packages/shared-backend/platform_shared/infra/render.py`, `infra/templates/`

### Problem

`render.py` renders each app's deploy workflow from `deploy.yml.j2`, but the
`ci-<app>.yml` workflows (backend tests, frontend build, lint and unit tests,
caddy image) are hand-written copies. So `new_app` gives a new app no per-app CI workflow (no backend tests,
frontend build, lint or unit tests; only the repo-wide workflows run),
and the copies drift: until #1692, three apps ran no frontend lint or tests and
MyJobHunter's frontend job was on Node 20. MyLanguageTutor, MyPizzaTracker and
MyRecipes already match apart from two comments and MyRecipes' API-client step.
MyBookkeeper (change detection, mocked layout E2E, no caddy-image job, no
Postgres service), MyJobHunter (change detection, pgvector) and
MyGamingAssistant (separate frontend-lint and frontend-test jobs) differ more.

### Recommended fix

Add `infra/templates/.github/workflows/ci.yml.j2` to `TEMPLATE_MAP`, starting
from the three matching workflows (API-client step on `has_api_client`, the
pgvector image from `postgres_image`), then move the other three onto it with
those differences (change detection, layout E2E, optional DB service, split
lint/test jobs) as template options rather than per-app copies.

---

## MEDIUM — `useIsAuthenticated` decodes the JWT payload with `atob`

**Logged:** 2026-11-02
**Scope:** `packages/shared-core/src/lib/auth-store.ts`

### Problem

JWT payloads are base64url, and `atob` throws on `-` and `_`. The surrounding
`catch` turns that into "signed out". A plain ASCII payload rarely encodes to those
characters, but a claim containing `>`, `?`, `~` or a non-ASCII character can, so
that user would read as signed out while their token is valid. Moved unchanged from
`shared-frontend` in the shared-core extraction; not reproduced with a real token.

### Recommended fix

Translate base64url to base64 before decoding, and add a test with a payload that
encodes to `-` and `_`.

---

## LOW — index.html theme scripts read localStorage unguarded

**Logged:** 2026-10-01
**Scope:** every app's `frontend/index.html`
**Effort:** Small; any byte change needs a new CSP hash in every app's `app.yaml`

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
