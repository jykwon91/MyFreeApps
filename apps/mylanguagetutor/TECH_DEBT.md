# MyLanguageTutor Tech Debt

Issues discovered during development. New entries are appended; resolved entries
are removed. Project policy is **log-only** (see `CLAUDE.md` -> Tech Debt Policy):
fix only Critical items that block the current feature.

**Open issues: 3 (Critical: 0 / High: 0 / Medium: 2 / Low: 1)**

---

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

### [Frontend] The main bundle is 624 kB (over Vite's 500 kB warning)

**Effort:** S
**Location:** `apps/mylanguagetutor/frontend/` (`npm run build`)
**Problem:** every route ships in one chunk. The other scaffolded apps have the
same problem.
**Recommendation:** lazy-load the auth and settings routes with `React.lazy` once the
conversation screen lands, since that screen will pull in audio code.

## Low

### [Frontend] The scaffold templates still carry MyGamingAssistant branding

**Effort:** S
**Location:** `infra/templates/scaffold/frontend/src/pages/{ForgotPassword,ResetPassword,NotFound,VerifyEmail}.tsx`, `index.html`
**Problem:** the scaffold ships the `Gamepad2` icon, a game-controller emoji
favicon, and "Back to games" copy. Every new app has to find and swap these
by hand (fixed locally here).
**Recommendation:** use a neutral `__APP_ICON__` token, or a generic lucide
icon plus neutral copy, in the template.
