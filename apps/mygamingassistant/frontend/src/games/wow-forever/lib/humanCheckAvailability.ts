import { isDiscordActivity } from "@platform/ui/discord-activity";
import { isServeOnly } from "@/lib/serveOnly";

/**
 * The Cloudflare Turnstile public site key baked into the bundle at build time
 * (VITE_TURNSTILE_SITE_KEY — docker build-arg chain, see
 * rules/verify-frontend-build-args.md). Empty in local dev / CI.
 */
export function turnstileSiteKey(): string {
  return import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
}

/**
 * Whether to offer a feature the public backend gates with a Turnstile human
 * check (the AI screenshot reader, "Suggest a feature").
 *
 * The public (serve-only) site is anonymous, so the backend requires a
 * Turnstile token there — without a site key in the bundle the widget can't
 * render and every call would fail, so the feature isn't offered. Full-auth
 * (local) builds always offer it; the backend skips Turnstile when it has no
 * secret. Either way the backend has the final say (503 when the operator
 * hasn't switched it on).
 */
export function isHumanCheckedFeatureOffered(): boolean {
  return !isServeOnly() || turnstileSiteKey() !== "";
}

/**
 * The site offers the feature, but not inside the Discord Activity: Turnstile
 * doesn't load through Discord's proxy (challenges.cloudflare.com is not
 * URL-mapped), so the Activity points to "Open in browser" instead.
 */
export function isHumanCheckedFeatureBrowserOnly(): boolean {
  return isDiscordActivity() && isHumanCheckedFeatureOffered();
}
