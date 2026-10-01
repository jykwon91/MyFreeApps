import type { AxiosInstance } from "axios";
import type { DiscordUrlMapping } from "./types/DiscordUrlMapping";
import { isDiscordActivity } from "./launchParams";
import { loadEmbeddedAppSdk, type EmbeddedAppSdkModule } from "./loadEmbeddedAppSdk";

/** Rewrites one absolute URL; returns its input when nothing applies. */
export type UrlRemapper = (url: string) => string;

export interface DiscordUrlRemapDeps {
  loadSdk: () => Promise<Pick<EmbeddedAppSdkModule, "attemptRemap">>;
}

const DEFAULT_DEPS: DiscordUrlRemapDeps = { loadSdk: loadEmbeddedAppSdk };

const ABSOLUTE_HTTP_URL = /^https?:\/\//i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Rewrite every absolute http(s) URL string inside JSON-shaped data — plain
 * objects and arrays at any depth — with `remap`. Anything else (Blob,
 * ArrayBuffer, class instances) is returned untouched, and branches with
 * nothing to rewrite keep their identity, so data without matching URLs comes
 * back as the very same object.
 */
export function remapUrlsDeep(value: unknown, remap: UrlRemapper): unknown {
  if (typeof value === "string") {
    return ABSOLUTE_HTTP_URL.test(value) ? remap(value) : value;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item: unknown) => {
      const mapped = remapUrlsDeep(item, remap);
      if (mapped !== item) changed = true;
      return mapped;
    });
    return changed ? next : value;
  }
  if (isPlainObject(value)) {
    let next: Record<string, unknown> | null = null;
    for (const [key, item] of Object.entries(value)) {
      const mapped = remapUrlsDeep(item, remap);
      if (mapped === item) continue;
      if (next === null) next = { ...value };
      next[key] = mapped;
    }
    return next ?? value;
  }
  return value;
}

/**
 * A remapper with exactly the Embedded App SDK's rewrite rules (its own
 * `attemptRemap`), so data rewritten here and requests rewritten by
 * `patchUrlMappings` always agree:
 * `https://<acct>.r2.cloudflarestorage.com/bucket/key?sig` →
 * `https://<client_id>.discordsays.com/r2/<acct>/bucket/key?sig`.
 */
export function createUrlRemapper(
  attemptRemap: EmbeddedAppSdkModule["attemptRemap"],
  mappings: readonly DiscordUrlMapping[],
): UrlRemapper {
  const sdkMappings = mappings.map(({ prefix, target }) => ({ prefix, target }));
  return (url) => {
    let original: URL;
    try {
      original = new URL(url);
    } catch {
      return url;
    }
    try {
      const remapped = attemptRemap({ url: original, mappings: sdkMappings }).toString();
      return remapped === original.toString() ? url : remapped;
    } catch (error) {
      // Only a mapping whose prefix names a {token} its target lacks throws.
      console.warn("[discord-activity] URL mapping is misconfigured; left %s as is", url, error);
      return url;
    }
  };
}

/**
 * Inside a Discord Activity, rewrite the URLs in every API response so media
 * loads through Discord's proxy.
 *
 * Discord's CSP lets an Activity load only from its own origin
 * (`https://<client_id>.discordsays.com`); other hosts must be reached via the
 * Developer Portal URL Mappings. `patchUrlMappings` rewrites fetch / XHR /
 * WebSocket calls, but not URLs that end up in `<img src>` / `<video src>`,
 * so the URLs the API hands out are rewritten here before anything renders
 * them. Outside Discord this installs nothing.
 *
 * Install once at startup, before the first request. If the SDK can't load,
 * responses pass through untouched (and the connect screen reports it).
 */
export function installDiscordUrlRemap(
  client: AxiosInstance,
  mappings: readonly DiscordUrlMapping[],
  deps: DiscordUrlRemapDeps = DEFAULT_DEPS,
): void {
  if (!isDiscordActivity() || mappings.length === 0) return;

  let remapper: Promise<UrlRemapper | null> | null = null;
  function getRemapper(): Promise<UrlRemapper | null> {
    if (remapper === null) {
      remapper = deps.loadSdk().then(
        (sdk) => createUrlRemapper(sdk.attemptRemap, mappings),
        (error: unknown) => {
          console.warn("[discord-activity] Embedded App SDK failed to load; API URLs are not remapped", error);
          return null;
        },
      );
    }
    return remapper;
  }

  client.interceptors.response.use(async (response) => {
    const remap = await getRemapper();
    if (remap !== null) response.data = remapUrlsDeep(response.data, remap);
    return response;
  });
}
