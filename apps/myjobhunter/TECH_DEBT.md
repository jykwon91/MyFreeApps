# MyJobHunter Tech Debt

Issues discovered during development. New entries are appended; resolved entries are
removed and the counts in this header are updated.

**Open issues: 1 (Critical: 0 / High: 1 / Medium: 0 / Low: 0)**

---

### [Frontend Tests] React 18 hoisted at monorepo root collides with React 19 declared in MyJobHunter

**Severity:** High
**Effort:** S–M
**Location:** `apps/myjobhunter/frontend/` — Vitest test runner; root `node_modules/react@18.3.1` vs `apps/myjobhunter/frontend/node_modules/react@19.2.5`
**Discovered:** PR C6 (account deletion + data export) — `2026-04-29`

**Problem:** Every Vitest JSX render (including the pre-existing `Login.test.tsx` and the
new `DeleteAccountModal.test.tsx` / `DataExportButton.test.tsx`) throws
`Objects are not valid as a React child (found: object with keys {$$typeof, type, key, props, _owner, _store})`
on the first `render(...)` call. Stack trace points at `../../../node_modules/react-dom/cjs/react-dom.development.js`
(the React 18 copy hoisted at the worktree root by another app's transitive deps),
while `react` resolves to the v19 nested under `apps/myjobhunter/frontend/node_modules/react`.
The mixed runtime produces an invalid React element shape.

Pure-JS Vitest tests (`src/lib/__tests__`, `src/features/auth/__tests__/useSignIn.test.ts`)
are unaffected — only JSX renders fail.

**Tried (not enough on its own):**
- `resolve.dedupe: ["react", "react-dom"]` in `vite.config.ts`
- Hard `resolve.alias` entries pointing each `react` / `react-dom` import at the app's
  nested `node_modules` directory
- `test.server.deps.inline: [/react/, /react-dom/, /^@platform\/ui/]` in `vitest.config.ts`

None of these forced Vitest to load the v19 `react-dom` over the hoisted v18.

**Recommendation:**
1. Pin the entire monorepo to a single React major. Easiest path: bump MBK frontend to React 19
   and remove the 18.3.x pin so npm hoists v19. Verify MBK still typechecks (React 19 type changes
   are minor in MBK's component shapes).
2. Alternatively, move MyJobHunter's frontend out of the workspace (add `noWorkspaceRoot` or
   give it its own `package-lock.json`) so its `node_modules` is fully isolated. This sacrifices
   shared installs but unblocks JSX tests today.
3. As a stop-gap so PRs aren't blocked: write the deletion + export coverage as Playwright
   E2E specs (already done in PR C6 — `e2e/account-deletion.spec.ts`) until React versions
   are unified.

**Why High and not Critical:** The endpoints are covered by backend unit tests (32 passing)
and an E2E spec, so the gap is in the JSX unit-test surface only. Production builds (`vite build`)
are unaffected — they correctly resolve React 19. Logging a Critical would imply the feature
ships broken; in fact it ships fully tested through backend + E2E layers.
