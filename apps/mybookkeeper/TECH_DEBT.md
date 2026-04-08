# Tech Debt

> Last scanned: 2026-04-07
> Issues: 1 critical, 1 high, 2 medium, 2 low

## Critical

### [Security] Chrome Extension -- Hardcoded credentials and production API URL
**Effort:** S
**Location:** `chrome-extension/sidepanel.js:73-76`, `chrome-extension/background.js:3`
**Problem:** The file `sidepanel.js` contains a `DEV_AUTO_LOGIN` object with a real email and plaintext password that auto-logs in on every extension load. This is committed to source control and visible to anyone who clones the repo. Additionally, `background.js` hardcodes the production API URL and the `manifest.json` includes the production IP in `host_permissions`. The comment says to set it to null before publishing but this is not enforced.
**Recommendation:**
1. Immediately set `DEV_AUTO_LOGIN = null` and rotate the compromised password.
2. Move the API URL to a configurable storage key or use `chrome.storage.sync` so it can be set per environment.
3. Remove the IP-based sslip.io URL from `host_permissions` (keep only `localhost` and `optional_host_permissions` for the production domain).
4. Add a pre-commit hook or CI check that rejects commits containing `DEV_AUTO_LOGIN` with non-null values.

---

## High

### [Security] CSP blocks PostHog in production
**Effort:** S
**Location:** `deploy/Caddyfile:7`
**Problem:** The Content-Security-Policy header does not include PostHog domains. The `connect-src` directive only allows `self` and `https://*.plaid.com`, which blocks all PostHog tracking requests to `https://us.i.posthog.com`. The `frame-src` directive blocks the embedded PostHog dashboard iframe used on the admin User Activity page. PostHog was added in PR #219 but the CSP was not updated.
**Recommendation:** Update the CSP in `deploy/Caddyfile` to add PostHog domains:
- `connect-src`: add `https://us.i.posthog.com https://*.posthog.com`
- `frame-src`: add `https://us.posthog.com`
- `script-src`: PostHog JS is bundled via npm so no change needed there.

---

## Medium

### [Architecture] Inline Plaid imports -- try/except in plaid_client.py [DEFERRED]
**Effort:** S
**Location:** `backend/app/integrations/plaid_client.py:10-23`
**Problem:** Plaid imports wrapped in try/except for optional dependency handling.
**Recommendation:** [DEFERRED] -- Acceptable pattern for optional dependencies.

---

### [Frontend] Inline Props interfaces in 48 component files [DEFERRED]
**Effort:** L
**Location:** 48 files across `frontend/src/app/features/`
**Problem:** Simple Props interfaces defined inline rather than in `shared/types/`.
**Recommendation:** [DEFERRED] -- Single-use Props colocated with their component are acceptable per prior decision.

---

## Low

### [Frontend] `as any` casts in 2 test files (6 occurrences)
**Effort:** M
**Location:** `frontend/src/__tests__/Documents.test.tsx` (4), `frontend/src/__tests__/Onboarding.test.tsx` (2)
**Problem:** Test mocks use `as any` to satisfy TypeScript.
**Recommendation:** Create typed mock factories for RTK Query return types.

---

### [Architecture] `demo_pdf_generator.py` at 1452 lines
**Effort:** M
**Location:** `backend/app/services/demo/demo_pdf_generator.py`
**Problem:** This file generates demo PDF documents and is over 1400 lines. While it is isolated to demo functionality and does not affect production code paths, its size makes it difficult to maintain or extend with new demo document types.
**Recommendation:** Split into separate generator modules per document type (e.g., `demo_invoice_generator.py`, `demo_1099_generator.py`, `demo_schedule_e_generator.py`) with a shared base for common PDF layout utilities.

---
## Resolved (2026-04-07 scan)

- ~~Repeated info-dismissed pattern across 9 pages~~ -- all 9 pages now use `useDismissable` hook from `shared/hooks/useDismissable.ts`

---

## Resolved (2026-04-03 second audit)

- ~~[Critical] `bulk_soft_delete` missing SQL bind parameter~~ -- added `params["source"] = source`
- ~~[High] `execute_readonly_query` no READ ONLY enforcement~~ -- added `SET TRANSACTION READ ONLY`
- ~~[High] `toggle_escrow_paid` accepts `body: dict`~~ -- created `EscrowPaidRequest` Pydantic schema
- ~~[High] `setattr` without allowlist in `tax_profile_repo`~~ -- added `_UPDATABLE_FIELDS` frozenset
- ~~[High] Dead `admin_auth` function~~ -- deleted + removed unused imports
- ~~[Medium] 14 bare `-> list` / `-> dict` route handler returns~~ -- typed all with Pydantic response models
- ~~[Medium] 3 bare `list` in ORM model/schema annotations~~ -- typed with element types
- ~~[Medium] Private `_assemble_tax_data`/`_parse_and_validate` in tax `__init__`~~ -- removed private re-exports
- ~~[Medium] Wildcard import in organization service `__init__`~~ -- removed (all consumers import submodules)
- ~~[Medium] Direct `db.flush()` in `transaction_service`~~ -- moved to `transaction_repo.flush()`
- ~~[Low] Untyped `_parse_response` parameter~~ -- typed as `anthropic.types.Message`
- ~~[Low] Inline import in `core/auth.py`~~ -- moved to top-level

---

## Resolved (2026-04-03 first audit -- PRs #180-#188)

- ~~[Critical] Sentry PII leak~~ -- `send_default_pii=False`
- ~~[Critical] test_utils.router always registered in prod~~ -- conditional import
- ~~[High] Missing security headers~~ -- HSTS, CSP, X-Frame-Options in Caddyfiles
- ~~[High] No password reset flow~~ -- full implementation with email + rate limiting
- ~~[High] 27 untyped dict route responses~~ -- Pydantic response models
- ~~[High] auth.spec.ts shallow tests~~ -- rewritten with real flows
- ~~[High] tax-documents.spec.ts `|| true` assertion~~ -- fixed
- ~~[High] SQL injection pattern in CLI~~ -- frozenset constant
- ~~[Medium] Raw `db.delete()` in service~~ -- email_queue_repo
- ~~[Medium] Raw `db.refresh()` in services~~ -- repo helpers
- ~~[Medium] Bare `except Exception`~~ -- narrowed to ValueError
- ~~[Medium] `UPDATABLE_FIELDS` inside functions~~ -- module-scope frozenset
- ~~[Medium] `AsyncSessionLocal()` bypasses `unit_of_work()`~~ -- reviewed, kept with comment
- ~~[Medium] E2E silent `if (!visible) return`~~ -- converted to test.skip()
- ~~[Medium] Missing E2E coverage~~ -- 4 new spec files
- ~~[Medium] tax-return-detail recompute test~~ -- fixed
- ~~[Medium] Inline components~~ -- extracted
- ~~[Medium] 13 untested frontend pages~~ -- 326 tests
- ~~[Low] Wildcard re-exports without `__all__`~~ -- explicit imports
- ~~[Low] `setattr(**kwargs)` without allowlist~~ -- added allowlists
- ~~[Low] `type: ignore[type-arg]`~~ -- typed
- ~~[Low] component-extraction.spec.ts URL~~ -- fixed
- ~~[Low] api-validation.spec.ts export tests~~ -- fixed

---

## Resolved (2026-04-02 bulk cleanup -- PRs #155-#163)

- ~~[High] TOTP route handler manages DB sessions directly~~ -- PR #156
- ~~[High] test_filter_by_property fails~~ -- PR #162
- ~~[Medium] 14 inline helper components~~ -- PR #160
- ~~[Medium] Demo E2E tests stale~~ -- PR #163
- ~~[Low] vendorRulesApi legacy naming~~ -- PR #159
- ~~[Low] typing.Any in 4 backend files~~ -- PR #157
- ~~[Low] any types in DocumentUploadZone test~~ -- PR #155
- ~~[E2E] Admin page failures~~ -- PR #161
- ~~[E2E] Chrome extension test credentials~~ -- PR #158
- ~~[E2E] Stale API URLs~~ -- PRs #158-161

---

## Resolved (2026-03-29 tech debt sweep + prior)

- ~~[Critical] Plaid webhook no signature verification~~ -- JWKS verification
- ~~[Critical] Route handlers with raw SQL/ORM queries~~ -- extracted to services
- ~~[High] 19 services import SQLAlchemy directly~~ -- moved to repos
- ~~[High] Inconsistent session management~~ -- all write paths use unit_of_work()
- ~~[High] Dead vendor_rules files~~ -- deleted
- ~~[High] Duplicate type directories~~ -- deleted
- ~~[High] Untyped dict parameters~~ -- replaced with TypedDicts
- ~~[High] Duplicate ColumnFilter/SortIndicator~~ -- extracted
- ~~[High] ManualEntryFormValues inline~~ -- reused existing
- ~~[Medium] 7 more items~~ -- all resolved
- ~~[Low] 5 more items~~ -- all resolved

---

## Suggested Agent Update

The audit instructions should add checks for:

1. **Detached ORM object serialization:** When a service returns an ORM object from within `unit_of_work()`, verify that Pydantic response serialization does not trigger lazy-loaded relationships after the session closes.

2. **Unvalidated request bodies:** When a route handler accepts `body: dict` instead of a Pydantic `BaseModel`, it bypasses input validation entirely. Scan all route handlers for `body: dict` parameters.

3. **CSP drift after feature additions:** When a new third-party service is integrated (analytics, CDN, API), verify the Content-Security-Policy header in the reverse proxy config covers the new domains. Flag any `connect-src`, `script-src`, `frame-src`, or `img-src` that is missing required origins.

4. **Hardcoded credentials in non-backend code:** Scan all non-Python files (JS, JSON, HTML, config) for patterns that look like passwords, API keys, or tokens. Dev credential objects that auto-login are a frequent source of leaks.
