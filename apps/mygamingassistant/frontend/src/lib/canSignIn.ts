import { isDiscordActivity } from "@platform/ui/discord-activity";

/**
 * True when /login (and the 2FA page) can be used in this session.
 *
 *  - Full-auth builds: always.
 *  - Serve-only builds: yes, but for the operator only — the backend mounts just the sign-in, /users/me,
 *    the 2FA routes and triage. /login is linked from nowhere; there is no registration or password reset.
 *  - The Discord Activity: never (no Discord sign-in in v1; sign in on the website).
 *
 * Fixed for the life of the page, so reading this during render is safe.
 */
export function canSignIn(): boolean {
  return !isDiscordActivity();
}
