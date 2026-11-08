import { isDiscordActivity } from "@platform/ui/discord-activity";
import { isServeOnly } from "@/lib/serveOnly";

/**
 * True when this session has no write API, so every write surface must stay
 * hidden and write / account routes redirect home (the operator's sign-in and
 * 2FA follow lib/canSignIn.ts instead):
 *
 *  - serve-only builds (VITE_SERVE_ONLY) — the public library mounts no write
 *    or account routes, only the operator's sign-in + triage (lib/serveOnly.ts);
 *  - the Discord Activity — the app runs on Discord's discordsays.com origin
 *    and v1 has no Discord sign-in, so the Activity is browse-only. Signing in
 *    and editing happen on the website ("Open in browser").
 *
 * Both are fixed for the life of the page, so reading this during render is safe.
 */
export function isReadOnly(): boolean {
  return isServeOnly() || isDiscordActivity();
}
