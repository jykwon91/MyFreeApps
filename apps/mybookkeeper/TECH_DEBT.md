# Tech Debt

> Last scanned: 2026-05-02
<<<<<<< HEAD
> Issues: 0 critical, 5 high, 2 medium (deferred), 0 low
=======
> Issues: 0 critical, 5 high, 3 medium (deferred), 0 low
>>>>>>> 12250ec (chore(mybookkeeper): log tech debt from contract-dates pipeline run)

## High

### [Auth] LOGIN_BLOCKED_UNVERIFIED audit event is silently lost on rollback
**Effort:** XS
**Location:** `apps/mybookkeeper/backend/app/api/totp.py` — `totp_login()` around line 143; same pattern in MJH `apps/myjobhunter/backend/app/api/totp.py`
**Problem:** When an unverified user hits `POST /auth/totp/login`, the handler calls `log_auth_event(... LOGIN_BLOCKED_UNVERIFIED ...)` but immediately raises `HTTPException` without calling `await db.commit()`. FastAPI's exception handler rolls back the session, so the audit row is never persisted. Every other early-exit branch in the same function commits before raising. Pre-existing; not introduced by PR fix/audit-log-gaps-pii-cleanup.
**Recommendation:** Add `await db.commit()` before the `raise HTTPException` on the `not user.is_verified` branch in both `apps/mybookkeeper/backend/app/api/totp.py` and `apps/myjobhunter/backend/app/api/totp.py`.

---

### [E2E] Lease import E2E test skips actual file upload (requires MinIO)
**Effort:** S
**Location:** `apps/mybookkeeper/frontend/e2e/lease-import.spec.ts` — "import dialog — submit triggers API call" test
**Problem:** The lease import endpoint (`POST /signed-leases/import`) requires MinIO object storage to complete successfully. In local dev (no MinIO), the endpoint returns 503. The primary E2E test uses a seed API endpoint (`/test/seed-signed-lease`) to bypass storage, but the dialog submission test cannot verify the full happy path (navigate to detail page after upload). The test accepts either a navigation or an error toast as a valid outcome.
**Recommendation:** Stand up a local MinIO container for E2E tests (via Docker Compose or MinIO standalone binary). Set `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` in the CI env and test .env. Once MinIO is available, rewrite the dialog-submit test to verify the full navigation path. Alternatively, add a `TEST_STORAGE_MOCK=true` env flag to the backend that returns a fake presigned URL without actual upload.

---

### [Frontend tests] Pre-existing frontend unit test failures unrelated to Gmail-disconnect PR
**Effort:** M
**Location:** frontend/src/__tests__/DocumentUploadZone.test.tsx, DrillDownPanel.test.tsx, InviteAccept.test.tsx, PendingInvites.test.tsx, Documents.test.tsx, Transactions.test.tsx, useDashboardFilter.test.ts
**Problem:** 43 unit tests across 8 files fail on main (e.g. `useMediaQuery` hook crashes during render, `filterState.selectedCategories.size` returns 4 instead of 1). Discovered during Gmail-disconnect PR validation — all failures reproduce on main before any new commits, so they were introduced in a prior merge.
**Recommendation:** Triage in a dedicated session. The `DocumentUploadZone` failures all trace to `useMediaQuery` mounting during test render; likely needs a jsdom matchMedia polyfill or a mock in conftest.

---

### [Frontend lint] 20+ files use setState synchronously inside useEffect (react-hooks/set-state-in-effect)
**Effort:** M
**Location:** src/app/pages/VerifyEmail.tsx, src/admin/features/costs/ThresholdSettings.tsx, src/admin/features/demo/CreateDemoDialog.tsx, src/app/pages/ResetPassword.tsx, and ~15 others
**Problem:** The `react-hooks/set-state-in-effect` ESLint rule flags synchronous setState calls inside useEffect bodies. The pattern causes cascading renders. Several pages use this for initialization (syncing query param to local state). The rule fires as errors and `npm run lint` fails.
**Recommendation:** Refactor each use to either (a) use a `key` prop to reset state when the dependency changes, or (b) derive the state from props using `useMemo` instead of `useEffect`. Fix file by file as each page is touched in future PRs.

---

<<<<<<< HEAD
### [Contract dates] Partial-update cannot explicitly null a date field
**Effort:** S
**Location:** `apps/mybookkeeper/backend/app/services/applicants/applicant_contract_service.py` — `update_contract_dates()`, comment at line 84-91; `apps/mybookkeeper/backend/app/schemas/applicants/applicant_update_request.py`
**Problem:** The PATCH schema uses `None` as the default for both `contract_start` and `contract_end`, making it impossible to distinguish "field not sent" from "field explicitly set to null". The service treats `None` as "keep existing value", which is the correct UX for the inline date picker (users rarely want to null a date). However, if a future UX needs a "clear date" action, the API cannot express it without a schema change (e.g., using `UNSET` sentinel or a separate `clear_contract_start: bool` field).
**Recommendation:** When a "clear date" UX is needed, extend the request schema to use `Annotated[date | None, Field(default=UNSET)]` with a custom sentinel, or add a separate `clear_fields: list[str]` parameter. Document this limitation in the schema docstring until then.
=======
### [Leases] LeaseGenerateForm not yet integrated into any app route

**Effort:** M
**Location:** `apps/mybookkeeper/frontend/src/app/features/leases/LeaseGenerateForm.tsx`
**Problem:** `LeaseGenerateForm` (originally from PR #175, enhanced in PR #185) is a standalone component with no consuming page route. The `GET /lease-templates/{id}/generate-defaults` endpoint exists and is tested, but the end-to-end flow (applicant selector + template picker + form) has no UI entry point yet. E2E tests cover the API layer only; UI-level E2E tests are blocked until the page is wired up.
**Recommendation:** In the follow-up lease-generate-page PR: mount `LeaseGenerateForm` inside a `/leases/new?template_id=&applicant_id=` route, add an applicant dropdown, and add Playwright E2E tests for the full UI flow including provenance badge rendering and the "Pull from source" confirmation.
>>>>>>> aabb3b1 (chore(mybookkeeper): log tech debt from lease-template-source-pull (PR #185))

---

### [E2E tests] "Bank Accounts section renders" fails because Plaid section no longer exists on Integrations page
**Effort:** XS
**Location:** frontend/e2e/integrations.spec.ts:453
**Problem:** The E2E test expects a "Bank Accounts" heading on the Integrations page but the page only renders a Gmail section. Either the Plaid UI was removed without updating the test, or the section is conditionally rendered and the condition is never true in test env.
**Recommendation:** Either remove the Bank Accounts test block or restore the Plaid UI section. Not fixed in this PR to keep scope to Gmail disconnect.

---

## Medium

### [Frontend tests] Debounce + async toast tests require switching between fake/real timers per test [DEFERRED]
**Effort:** S
**Location:** `apps/mybookkeeper/frontend/src/__tests__/ContractDatesEditor.test.tsx` — `shows success toast` and `shows error toast` tests (lines 129-162)
**Problem:** Tests that verify debounce behavior use `vi.useFakeTimers()` (to control `setTimeout`), but toast-verification tests must call `vi.useRealTimers()` at the top of the test because `waitFor` with fake timers doesn't flush async promise chains reliably. This creates a brittle pattern: if a new test forgets to switch, it silently passes or flakes. The root cause is mixing synchronous timer control with async RTK mutation resolution.
**Recommendation:** Refactor toast tests to use `vi.runAllTimersAsync()` (Vitest ≥ 1.6) which advances both fake timers and microtask queue atomically. This would allow all tests to keep `vi.useFakeTimers()` throughout the describe block.

---

### [Architecture] Inline Plaid imports -- try/except in plaid_client.py [DEFERRED]
**Effort:** S
**Location:** backend/app/integrations/plaid_client.py:10-23
**Problem:** Plaid imports wrapped in try/except for optional dependency handling.
**Recommendation:** [DEFERRED] -- Acceptable pattern for optional dependencies.

---

### [Frontend] Inline Props interfaces in 48 component files [DEFERRED]
**Effort:** L
**Location:** 48 files across frontend/src/app/features/
**Problem:** Simple Props interfaces defined inline rather than in shared/types/.
**Recommendation:** [DEFERRED] -- Single-use Props colocated with their component are acceptable per prior decision.

---

## Resolved (2026-04-14 audit batch 3)

- ~~[Low] as-any casts in 2 test files~~ — replaced 6 `as any` casts with typed mock factories
- ~~[Low] demo_pdf_generator.py 1452 lines~~ — split into demo_generators/ package: base.py (323), document_pdfs.py (584), tax_forms.py (566) (PR #238)
- ~~[Low] Caddyfile hardcoded home IP~~ — replaced with `{$ADMIN_ALLOWED_IP}` env var, setup.sh prompts for IP and writes systemd override

## Resolved (2026-04-14 audit batch 2)

- ~~[High] Services import ORM models directly~~ — moved construction from 4 key services (tenant, property, transaction, tax_return) into repo `create_*` functions
- ~~[Medium] TwoFactorSetup imperative API~~ — migrated to RTK Query with totpApi slice (PR #236)
- ~~[Medium] TransactionPanel.tsx 500 lines~~ — split into TransactionPanel (250) + TransactionForm (260) + TransactionDuplicateActions (63)

## Resolved (2026-04-14 audit fix)

- ~~[Critical] Chrome Extension hardcoded prod API URL and IP~~ -- API URL now configurable via chrome.storage.sync, production IP removed from manifest.json host_permissions
- ~~[High] Admin DB endpoints no organization scoping~~ -- organization_id parameter added to all bulk operations and repo queries
- ~~[High] tax_validation_service.py 1762-line god module~~ -- split into tax_validation/ package with 6 focused rule modules (income, rental, se, deduction, investment, general)

## Resolved (2026-04-13 scan)

- ~~[Critical] Chrome Extension DEV_AUTO_LOGIN with real credentials~~ -- now set to null in sidepanel.js:73
- ~~[High] CSP blocks PostHog in production~~ -- CSP in deploy/Caddyfile:7 now includes PostHog domains

---

## Resolved (2026-04-07 scan)

- ~~Repeated info-dismissed pattern across 9 pages~~ -- all 9 pages now use useDismissable hook

---

## Resolved (2026-04-03 second audit)

- ~~[Critical] bulk_soft_delete missing SQL bind parameter~~
- ~~[High] execute_readonly_query no READ ONLY enforcement~~
- ~~[High] toggle_escrow_paid accepts body: dict~~
- ~~[High] setattr without allowlist in tax_profile_repo~~
- ~~[High] Dead admin_auth function~~
- ~~[Medium] 14 bare -> list / -> dict route handler returns~~
- ~~[Medium] 3 bare list in ORM model/schema annotations~~
- ~~[Medium] Private re-exports in tax __init__~~
- ~~[Medium] Wildcard import in organization service __init__~~
- ~~[Medium] Direct db.flush() in transaction_service~~
- ~~[Low] Untyped _parse_response parameter~~
- ~~[Low] Inline import in core/auth.py~~

---

## Resolved (2026-04-03 first audit -- PRs #180-#188)

- ~~[Critical] Sentry PII leak~~ -- send_default_pii=False
- ~~[Critical] test_utils.router always registered in prod~~ -- conditional import
- ~~[High] Missing security headers~~ -- HSTS, CSP, X-Frame-Options in Caddyfiles
- ~~[High] No password reset flow~~ -- full implementation with email + rate limiting
- ~~[High] 27 untyped dict route responses~~ -- Pydantic response models
- ~~[High] auth.spec.ts shallow tests~~ -- rewritten with real flows
- ~~[High] tax-documents.spec.ts || true assertion~~ -- fixed
- ~~[High] SQL injection pattern in CLI~~ -- frozenset constant
- ~~[Medium] 9 items~~ -- all resolved
- ~~[Low] 5 items~~ -- all resolved

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

1. **Detached ORM object serialization:** When a service returns an ORM object from within unit_of_work(), verify that Pydantic response serialization does not trigger lazy-loaded relationships after the session closes.

2. **Unvalidated request bodies:** When a route handler accepts body: dict instead of a Pydantic BaseModel, it bypasses input validation entirely.

3. **CSP drift after feature additions:** When a new third-party service is integrated, verify the Content-Security-Policy header covers the new domains.

4. **Hardcoded credentials in non-backend code:** Scan all non-Python files for patterns that look like passwords, API keys, or tokens.

5. **Admin endpoint data isolation:** When scanning admin/superuser endpoints, verify they either scope operations to a specific organization or have explicit justification for cross-org access.
