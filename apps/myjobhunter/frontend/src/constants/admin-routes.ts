/**
 * Admin-only frontend routes. Centralised so route definitions, nav
 * descriptors, and any future redirect logic share one source of
 * truth — no magic strings sprinkled through the codebase.
 *
 * Backend-side these routes are gated by `require_admin`
 * (Role.ADMIN). The frontend uses these paths only to decide what
 * to render in the SPA.
 */
export const ADMIN_ROUTES = {
  DEMO_USERS: "/admin/demo",
} as const;
