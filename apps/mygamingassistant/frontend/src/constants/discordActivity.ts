import type { DiscordUrlMapping } from "@platform/ui/discord-activity";

/**
 * The public website. Inside the Discord Activity the app is served from
 * https://<client_id>.discordsays.com, so `window.location` can't say where the
 * real site lives — "Open in browser" sends people here.
 */
export const MGA_SITE_URL = "https://mygamingassistant.myfreeapps.org";

/**
 * Discord Activity URL Mappings for hosts other than the site itself. Keep these
 * IDENTICAL to the Developer Portal (Activities → URL Mappings).
 *
 * Inside the Activity, Discord's CSP blocks every origin except its own proxy,
 * so the media URLs the API hands out (R2 clips, stills, minimaps — the hosts
 * in app.yaml's img-src / media-src / connect-src) are rewritten onto these
 * prefixes and fetched through Discord:
 *
 *   /r2/{subdomain}  →  {subdomain}.r2.cloudflarestorage.com   presigned R2 URLs (prod default)
 *   /mga-clips       →  mga-clips.myfreeapps.org               R2 custom domain (MINIO_PUBLIC_BASE_URL)
 *
 * The portal's third mapping, `/` → mygamingassistant.myfreeapps.org (the page,
 * its assets and /api), is not listed: same-origin requests need no rewriting,
 * and the portal requires it LAST, after the longer prefixes.
 *
 * Deliberately NOT mapped: challenges.cloudflare.com (Turnstile — inside the
 * Activity the screenshot reader sends people to the browser instead) and
 * www.youtube-nocookie.com (allowed by the site's frame-src, but no page embeds
 * a YouTube player). discordActivityMappings.test.ts checks this list against
 * the site's CSP in app.yaml.
 */
export const MGA_DISCORD_URL_MAPPINGS: readonly DiscordUrlMapping[] = [
  { prefix: "/r2/{subdomain}", target: "{subdomain}.r2.cloudflarestorage.com" },
  { prefix: "/mga-clips", target: "mga-clips.myfreeapps.org" },
];
