/**
 * Superuser-only frontend routes. Centralised so route definitions,
 * nav descriptors, and any future redirect logic share one source of
 * truth — no magic strings sprinkled through the codebase.
 *
 * Every entry below is gated by `current_superuser` server-side and
 * by `<RequireSuperuser>` client-side. The frontend uses these paths
 * only to decide what to render in the SPA.
 */
export const ADMIN_ROUTES = {
  DASHBOARD: "/admin",
  DEMO_USERS: "/admin/demo",
  INVITES: "/admin/invites",
} as const;
