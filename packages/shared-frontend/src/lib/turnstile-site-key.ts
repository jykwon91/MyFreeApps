/** The Cloudflare Turnstile site key inlined into the bundle. Empty in dev / CI, where Turnstile is off. */
export function turnstileSiteKey(): string {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
}
