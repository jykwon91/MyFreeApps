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
 * Whether to offer the AI screenshot reader at all.
 *
 * The public (serve-only) site is anonymous, so the backend requires a
 * Turnstile token there — without a site key in the bundle the widget can't
 * render and every call would fail, so the reader isn't offered. Full-auth
 * (local) builds always offer it; the backend skips Turnstile when it has no
 * secret. Either way the backend has the final say (503 item_reader_unavailable
 * when the operator hasn't switched it on).
 */
export function isScreenshotReaderOffered(): boolean {
  return !isServeOnly() || turnstileSiteKey() !== "";
}

/**
 * The site offers the reader, but not inside the Discord Activity: the public
 * backend requires a Cloudflare Turnstile check, and Turnstile doesn't load
 * through Discord's proxy (challenges.cloudflare.com is not URL-mapped). The
 * Activity defaults to pasting text and points to "Open in browser" instead.
 */
export function isScreenshotReaderBrowserOnly(): boolean {
  return isDiscordActivity() && isScreenshotReaderOffered();
}
