# MyLanguageTutor Tech Debt

Issues discovered during development. New entries are appended; resolved entries
are removed. Project policy is **log-only** (see `CLAUDE.md` -> Tech Debt Policy):
fix only Critical items that block the current feature.

**Open issues: 10 (Critical: 0 / High: 1 / Medium: 6 / Low: 3)**

---

## High

### [Testing] No E2E coverage for the conversation loop

**Effort:** M
**Location:** `apps/mylanguagetutor/frontend/` (a `test:e2e` script exists; no `e2e/` folder or CI job)
**Problem:** onboarding -> scenarios -> practice -> streamed reply is covered by
backend API tests (fake Claude) and frontend unit/component tests (mocked
stream + speech), but no test drives the real browser flow end to end.
**Recommendation:** add `e2e/playwright.config.ts` plus one spec using typed
practice (speech APIs aren't scriptable), with a backend fake-Claude switch
for test environments. Wire it into CI.

## Medium

### [Infra] The scaffolder has no multi-user variant

**Effort:** M
**Location:** `infra/templates/scaffold/`, `packages/shared-backend/platform_shared/infra/new_app.py`
**Problem:** `new_app` only produces the single-user shape (seeded operator,
no `/register`, singular `user` table). MyRecipes and MyLanguageTutor were both
converted to multi-user by hand: they copied `main.py`, `core/auth.py`,
`core/config.py`, `core/rate_limit.py`, the `users` model and repo, the
conftest, `.env.docker.example`, the Register page, and they renamed the
table in `0001`. Two hand conversions of Tier 2 code is exactly how drift
starts.
**Recommendation:** add `new_app --multi-user`. It should render the register
router, `build_seed_admin_hook`, the `users` table, the SEED_ADMIN_* env block,
the Register page, and the Login "Create account" link. Then add a conformance
test that diffs the auth shell of the multi-user apps against each other.

### [Frontend] The main bundle is 662 kB (over Vite's 500 kB warning)

**Effort:** S
**Location:** `apps/mylanguagetutor/frontend/` (`npm run build`)
**Problem:** every route ships in one chunk. The other scaffolded apps have the
same problem.
**Recommendation:** lazy-load the auth and settings routes with `React.lazy`.
The conversation screen has landed (PR 4), so this can be done now.

### [Backend] Quota rows are not purged on account deletion

**Effort:** S
**Location:** `platform_shared` account-deletion router; `daily_usage_counters`
**Problem:** the shared deletion router has no per-app hook, so the
`ltutor:user:<uuid>` quota rows outlive the user until they age out. They
hold only a UUID and a count (no PII), so this is hygiene, not a leak.
**Recommendation:** add an `on_delete_user` hook to the shared deletion flow
and purge `daily_usage_counters` rows for the user in it.

### [Cost] Corrections weight assumes Sonnet 5 costs 2x Haiku 4.5

**Effort:** S
**Location:** `backend/app/core/config.py` (`ltutor_corrections_unit_weight`)
**Problem:** the cost-unit weight is 2.0 per the operator's pricing note. If
Sonnet 5's list price differs, the daily caps over- or under-count.
**Recommendation:** check https://www.anthropic.com/pricing and set
`LTUTOR_CORRECTIONS_UNIT_WEIGHT` to Sonnet input price / Haiku input price.

### [Privacy] No retention limit on transcripts

**Effort:** M
**Location:** `tutor_session`, `tutor_turn`
**Problem:** encrypted transcripts are kept until the learner deletes their
account. There's no history UI yet, so learners can't delete single sessions.
**Recommendation:** a 90-day retention job (delete ended sessions older than
90 days), plus the `/history` page below with per-session delete.

### [Security] No Turnstile on session start

**Effort:** S
**Location:** `POST /sessions`
**Problem:** a verified account can script sessions. The per-user and global
cost caps bound spend, but a bot-farm of verified accounts could still use
the global cap and lock real learners out for the day.
**Recommendation:** require a Turnstile token on `POST /sessions` (not per turn).

## Low

### [Frontend] The scaffold templates still carry MyGamingAssistant branding

**Effort:** S
**Location:** `infra/templates/scaffold/frontend/src/pages/{ForgotPassword,ResetPassword,NotFound,VerifyEmail}.tsx`, `index.html`
**Problem:** the scaffold ships the `Gamepad2` icon, a game-controller emoji
favicon, and "Back to games" copy. Every new app has to find and swap these
by hand (fixed locally here).
**Recommendation:** use a neutral `__APP_ICON__` token, or a generic lucide
icon plus neutral copy, in the template.

### [Frontend] Deferred screens: /history and /settings/language

**Effort:** M
**Location:** `frontend/src/pages/`
**Problem:** there's no page listing past conversations (the API exists:
`GET /sessions`, `GET /sessions/{id}`, `DELETE /sessions/{id}`), and the
language can only be changed by visiting `/onboarding/language`.
**Recommendation:** add `/history` (list + detail + delete) and a language row
in Settings once a second language ships.

### [Frontend] No "Report" link on corrections

**Effort:** S
**Location:** `frontend/src/features/session/CorrectionCard.tsx`
**Problem:** learners can't flag a wrong correction, so bad model output is
invisible to the operator.
**Recommendation:** add a small "Report" action that POSTs the turn id plus the
correction index to a feedback endpoint (log ids only, never transcript text).
