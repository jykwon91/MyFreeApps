/**
 * The Discord Activity's URL Mappings (constants/discordActivity.ts) against
 * what the site actually loads.
 *
 * Inside the Activity, Discord's CSP lets the app reach only its own proxy
 * origin, so every external host the app loads from needs a Developer Portal
 * URL Mapping AND the same entry in MGA_DISCORD_URL_MAPPINGS (which rewrites
 * the media URLs the API hands out). The website's CSP in app.yaml already
 * lists every external host the app loads from, so the two are checked against
 * each other: a media host added to the CSP without a mapping — or a mapping
 * left behind after its host is dropped — fails here instead of inside Discord.
 */
import { describe, expect, it } from "vitest";
import appYaml from "../../../app.yaml?raw";
import { loadEmbeddedAppSdk } from "@platform/ui/discord-activity/loadEmbeddedAppSdk";
import { createUrlRemapper } from "@platform/ui/discord-activity/urlRemap";
import { MGA_DISCORD_URL_MAPPINGS } from "@/constants/discordActivity";

// Hosts the site's CSP allows that the Activity deliberately leaves unmapped.
const UNMAPPED_HOSTS: ReadonlyMap<string, string> = new Map([
  ["challenges.cloudflare.com", "Turnstile: inside Discord the screenshot reader points to the browser"],
  ["www.youtube-nocookie.com", "frame-src only: no page embeds a YouTube player"],
]);

/** Every https host in the site's CSP, with the directives that allow it. */
function cspHosts(): Map<string, string[]> {
  const csp = /^csp:\s*"([^"]+)"/m.exec(appYaml)?.[1];
  if (csp === undefined) throw new Error("app.yaml has no csp line");
  const hosts = new Map<string, string[]>();
  for (const directive of csp.split(";")) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    for (const source of sources) {
      if (!source.startsWith("https://")) continue;
      const host = source.slice("https://".length);
      hosts.set(host, [...(hosts.get(host) ?? []), name]);
    }
  }
  return hosts;
}

/** A mapping target as a CSP host source: `{subdomain}.example.com` → `*.example.com`. */
function asCspHost(target: string): string {
  return target.replace(/^\{[a-z]+\}/, "*");
}

describe("Discord Activity URL Mappings", () => {
  it("cover every external host the site loads from", () => {
    const mapped = new Set(MGA_DISCORD_URL_MAPPINGS.map(({ target }) => asCspHost(target)));
    const uncovered = [...cspHosts()].filter(([host]) => !mapped.has(host) && !UNMAPPED_HOSTS.has(host));
    expect(uncovered).toEqual([]);
  });

  it("map only hosts the site's CSP allows", () => {
    const hosts = cspHosts();
    const stale = MGA_DISCORD_URL_MAPPINGS.filter(({ target }) => !hosts.has(asCspHost(target)));
    expect(stale).toEqual([]);
  });

  it("leave unmapped only hosts the CSP still lists", () => {
    const hosts = cspHosts();
    expect([...UNMAPPED_HOSTS.keys()].filter((host) => !hosts.has(host))).toEqual([]);
  });

  it("are written the way the Developer Portal takes them", () => {
    for (const { prefix, target } of MGA_DISCORD_URL_MAPPINGS) {
      // "/" → the site itself is the portal's LAST mapping, never listed here.
      expect(prefix).toMatch(/^\/[^/]+(\/[^/]+)*$/);
      // The proxy owns these paths, so they must never be the site's own.
      expect(["api", "assets"]).not.toContain(prefix.split("/")[1]);
      // Targets are bare hosts: no protocol, no trailing slash.
      expect(target).not.toMatch(/^[a-z]+:\/\//i);
      expect(target.endsWith("/")).toBe(false);
    }
  });

  it("send MGA's media URLs through the Activity's own origin", async () => {
    // The SDK's own rewrite rules — the same ones patchUrlMappings applies.
    const { attemptRemap } = await loadEmbeddedAppSdk();
    const remap = createUrlRemapper(attemptRemap, MGA_DISCORD_URL_MAPPINGS);
    const proxy = `https://${window.location.host}`;
    const query = "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=0f1e2d";

    // Presigned R2 URL (path style: <account>.r2.cloudflarestorage.com/<bucket>/<key>).
    expect(remap(`https://0a1b2c3d.r2.cloudflarestorage.com/mga-media/lineups/cs2/mirage/42.mp4${query}`)).toBe(
      `${proxy}/r2/0a1b2c3d/mga-media/lineups/cs2/mirage/42.mp4${query}`,
    );
    // R2 custom domain (MINIO_PUBLIC_BASE_URL).
    expect(remap("https://mga-clips.myfreeapps.org/lineups/cs2/mirage/42-still.webp")).toBe(
      `${proxy}/mga-clips/lineups/cs2/mirage/42-still.webp`,
    );
    // The site itself is served by the portal's root mapping — nothing to rewrite.
    expect(remap("https://mygamingassistant.myfreeapps.org/cs2/mirage")).toBe(
      "https://mygamingassistant.myfreeapps.org/cs2/mirage",
    );
  });
});
