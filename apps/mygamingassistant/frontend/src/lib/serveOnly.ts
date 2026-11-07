/**
 * Serve-only mode detection.
 *
 * In the production serve-only deployment, MGA is a PUBLIC READ-ONLY lineup
 * library. Players never sign in. The backend mounts only the operator's
 * sign-in (JWT / TOTP login, logout, GET /users/me, 2FA settings) and the
 * superuser-only triage API — no registration, password reset, verification,
 * account or write routers. So the frontend:
 *   - RootLayout renders the GuestShell only (never AppShell), with NO
 *     "Sign in" CTA and public-only nav; a signed-in operator gets only
 *     Triage / Two-factor / Sign out (ServeOnlyOperatorActions).
 *   - Write <AuthRequired> routes redirect to home instead of a Sign-in card.
 *   - /login and /security stay (lib/canSignIn.ts); /forgot-password,
 *     /reset-password and /verify-email redirect to home.
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
