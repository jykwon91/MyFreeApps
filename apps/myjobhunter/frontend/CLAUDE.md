# MyJobHunter — Frontend

## Stack

| Layer | Tech |
|---|---|
| Framework | React 18 + TypeScript + Vite 5 |
| Styling | TailwindCSS 3 (CSS variables for theming) |
| State | Redux Toolkit + RTK Query (`baseApi` from `@platform/ui`) |
| Routing | React Router v6 (data router — `createBrowserRouter`) |
| Forms | React Hook Form (for any form with validation or >3 fields) |
| Icons | Lucide React |
| UI Components | `@platform/ui` — consume existing components, never reimplement |

## Local Dev

```bash
# From apps/myjobhunter/frontend/
npm run dev      # Dev server on :5174 — requires backend on :8002
npm run build    # TypeScript check + Vite build
npm run typecheck  # Type-check without building
npm run lint     # ESLint
npm test         # Vitest unit tests
```

**Backend dependency:** The dev proxy at `/api` forwards to `http://localhost:8002`.
Start the backend before running E2E tests:
```bash
# From apps/myjobhunter/backend/
source .venv/bin/activate
uvicorn app.main:app --reload --reload-dir app --port 8002
```

## Port offsets

| Environment | Frontend | Backend |
|---|---|---|
| Dev | :5174 | :8002 |
| Prod (behind Caddy) | :8092 (frontend static) | :8002 |

MyRestaurantReviews uses :5173 / :8001 — no collision.

## Directory layout

```
src/
  main.tsx          # Redux Provider + React entry
  App.tsx           # createBrowserRouter + RouterProvider
  RootLayout.tsx    # RequireAuth + AppShell + Toaster + ScrollRestoration
  routes.tsx        # All route definitions
  index.css         # Tailwind directives + CSS variable theme
  vite-env.d.ts     # VITE_* env type declarations
  test-setup.ts     # @testing-library/jest-dom setup

  constants/
    nav.ts          # Nav descriptors + buildNav() + buildBottomNav()
    empty-states.ts # Per-page empty-state copy + icon names

  pages/            # Route-level components (one file per route)
  features/         # Domain feature components + hooks
    applications/   # ApplicationsSkeleton, ApplicationDetailSkeleton
    companies/      # CompaniesSkeleton, CompanyDetailSkeleton
    dashboard/      # DashboardSkeleton
    profile/        # ProfileSkeleton
    auth/           # useSignIn hook

  lib/
    api.ts          # Re-exports @platform/ui axios instance
    auth.ts         # signIn / register / signOut helpers
    store.ts        # Redux store with baseApi

  types/            # Per-domain TypeScript types (Phase 2+)
```

## Nav structure

Desktop sidebar (5 items):
1. Dashboard — `/dashboard`
2. Applications — `/applications`
3. Companies — `/companies`
4. Profile — `/profile`
5. Settings — `/settings`

Mobile bottom nav (FAB in center slot):
1. Dashboard
2. Applications
3. **FAB** — "Add application" — navigates to `/applications` (Phase 2: opens dialog)
4. Profile
5. Settings

Defined in `src/constants/nav.ts`. Icons injected at runtime in `RootLayout.tsx`.

## Empty-state copy

Exact approved copy lives in `src/constants/empty-states.ts`. Never change inline.

| Page | Heading |
|---|---|
| Dashboard | "Your hunt starts here" |
| Applications | "No applications yet" |
| Profile | "Tell me about yourself" |
| Companies | "No companies here yet" |

## Skeleton strategy

Every list/detail page has a matching skeleton that mirrors the loaded layout exactly.
Phase 1 shows empty states immediately (no real data), but skeleton code paths are
wired so Phase 2 data fetching switches seamlessly via `isLoading` from RTK Query.

Rule: skeleton cell widths must match loaded cell widths. Never use `w-full` for
a cell that will render a badge or short string.

## Testing

### Unit tests (Vitest + React Testing Library)

```bash
npm test            # from apps/myjobhunter/frontend/
```

Test files live alongside source under `__tests__/` siblings. Only pages/components
with real logic get unit tests. Skeleton-only or empty-state-only components are
covered by E2E.

### E2E (Playwright)

```bash
# From apps/myjobhunter/frontend/
npx playwright test --config e2e/playwright.config.ts
```

**Requires backend running on :8002.**

Config: `e2e/playwright.config.ts`
Smoke test: `e2e/smoke.spec.ts` — creates a test user, navigates all 5 pages,
checks empty states, tests 404, signs out.

Known gap (Phase 1): No user self-delete endpoint yet. Test users with
`@myjobhunter-test.invalid` email domain accumulate in dev DB. Clean up with:
```bash
python backend/scripts/cleanup_test_users.py
```

Workers capped at 50% CPU: `workers: "50%"` in playwright config.

## Key conventions

- **Never reimplement components from @platform/ui.** If a component is missing, stop and report.
- **No inline component definitions.** Extract to separate files.
- **Skeletons must mirror loaded layout.** Same columns, same grid, same element counts.
- **One type/interface per file** in `src/types/`.
- **Constants in dedicated files.** Never define nav items or empty-state copy inline in components.
- **All imports at the top of the file.** Never inline imports.
- **Toast for feedback.** `showSuccess` / `showError` from `@platform/ui`. Never `alert()`.
- **Loading states on buttons.** Use `LoadingButton` from `@platform/ui` for any async action.

## @platform/ui components available

See `packages/shared-frontend/src/index.ts` for the full export list. Key components:

- `AppShell` — sidebar + mobile bottom nav + header + user menu
- `RequireAuth` — redirects to `/login` if not authenticated
- `LoginForm` — email/password tabs with trust copy and strength hint
- `DataTable` — sortable table with `loading` prop for skeleton rows
- `EmptyState` — rich variant: icon + heading + body + action
- `FileUploadDropzone` — file input with drag-and-drop, `disabled` prop
- `Badge`, `Button`, `LoadingButton`, `Card`, `Skeleton`, `Toaster`

## Auth flow

1. `LoginForm` calls `onSignIn` / `onRegister` props
2. `src/lib/auth.ts` posts to fastapi-users endpoints (`application/x-www-form-urlencoded` for login)
3. Token stored in `localStorage["token"]`
4. `notifyAuthChange()` from `@platform/ui` triggers `useIsAuthenticated` re-render
5. `RequireAuth` in `RootLayout` redirects unauthenticated users to `/login`
6. 401 responses handled by the shared axios interceptor in `@platform/ui/lib/api`
