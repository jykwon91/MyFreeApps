/**
 * Serve-only mode detection.
 *
 * In the production serve-only deployment, MGA is a PURE PUBLIC READ-ONLY
 * lineup library with ZERO authentication. The backend mounts no auth routes
 * (they 404), so the frontend must hide every auth affordance:
 *   - RootLayout renders the GuestShell only (never AppShell), with NO
 *     "Sign in" CTA and public-only nav.
 *   - <AuthRequired> redirects to home instead of showing a Sign-in card.
 *   - The /login, /forgot-password, /reset-password, /verify-email routes
 *     redirect to home (they'd hit absent backend endpoints otherwise).
 *
 * The flag is the Vite build-time public env VITE_SERVE_ONLY (inlined into the
 * bundle at `npm run build`). It is wired through the docker build-args chain
 * (docker-compose build.args → caddy.Dockerfile ARG/ENV) exactly like
 * VITE_TURNSTILE_SITE_KEY. Local dev / CI leave it unset → full auth UI.
 *
 * Compared with === "true" (not truthiness) so only the explicit string enables
 * it — an accidental empty-string inline can never silently turn auth off OR
 * on. Fail closed toward the safe default (full auth) when unset.
 */
export function isServeOnly(): boolean {
  return import.meta.env.VITE_SERVE_ONLY === "true";
}
