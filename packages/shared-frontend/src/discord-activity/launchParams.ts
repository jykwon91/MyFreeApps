import { readSessionStorage, writeSessionStorage } from "../lib/safeStorage";

/**
 * Discord Activity detection.
 *
 * Discord launches an Activity by iframing
 * `https://<client_id>.discordsays.com/?frame_id=…&instance_id=…&platform=…`
 * (plus guild / channel / location ids). `frame_id` is the signal that the app
 * runs inside Discord; without it the app is a normal website and nothing in
 * this module changes its behaviour.
 *
 * The answer is worked out once per page and kept for the session:
 *  - client-side navigation drops the query string, so it can't be re-read
 *    from the URL later;
 *  - a reload (stale-chunk recovery, "Try again") lands on a URL without the
 *    launch parameters, so they are also kept in sessionStorage — per tab and
 *    per origin, so the Activity's discordsays.com origin never shares them
 *    with the real site.
 */

/** sessionStorage key holding the launch query string for reloads. */
export const DISCORD_LAUNCH_STORAGE_KEY = "platform:discord-activity-launch";

/** Query parameters Discord appends when it launches an Activity. */
export const DISCORD_LAUNCH_PARAMS = [
  "frame_id",
  "instance_id",
  "platform",
  "guild_id",
  "channel_id",
  "location_id",
  "custom_id",
  "referrer_id",
  "mobile_app_version",
] as const;

// undefined = not worked out yet; null = not inside Discord.
let launchSearch: string | null | undefined;

/** Just Discord's launch parameters (`?frame_id=…`), or `null` when the search has none. */
function launchSearchFrom(search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.get("frame_id")) return null;
  const launch = new URLSearchParams();
  for (const key of DISCORD_LAUNCH_PARAMS) {
    const value = params.get(key);
    if (value !== null) launch.set(key, value);
  }
  return `?${launch.toString()}`;
}

function resolveLaunchSearch(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = launchSearchFrom(window.location.search);
  if (fromUrl !== null) {
    writeSessionStorage(DISCORD_LAUNCH_STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  const stored = readSessionStorage(DISCORD_LAUNCH_STORAGE_KEY);
  return stored === null ? null : launchSearchFrom(stored);
}

/**
 * The query string Discord launched this Activity with (only Discord's own
 * parameters), or `null` outside Discord. The Embedded App SDK reads its
 * launch parameters from this instead of `window.location.search`.
 */
export function getDiscordLaunchSearch(): string | null {
  if (launchSearch === undefined) launchSearch = resolveLaunchSearch();
  return launchSearch;
}

/** True when the app is running as a Discord Activity. */
export function isDiscordActivity(): boolean {
  return getDiscordLaunchSearch() !== null;
}

/**
 * `search` without Discord's launch parameters — `""` or `"?…"`. Use it before
 * sending a URL out of the Activity: the real site must never see `frame_id`,
 * or it would believe it is inside Discord.
 */
export function withoutDiscordLaunchParams(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of DISCORD_LAUNCH_PARAMS) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/** Forget the cached answer so a test can change `window.location`. */
export function __resetDiscordLaunchForTests(): void {
  launchSearch = undefined;
}
