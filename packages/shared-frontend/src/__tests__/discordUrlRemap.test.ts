/**
 * Media URLs inside a Discord Activity.
 *
 * Discord's CSP only lets an Activity load from its own origin, so media on
 * other hosts must go through the URL Mappings proxy. The SDK's
 * patchUrlMappings covers fetch / XHR / WebSocket but not <img src>, so the
 * URLs in API responses are rewritten — with the SDK's own attemptRemap, so
 * the two rewrites can never disagree.
 */
import axios, { type AxiosInstance } from "axios";
import { attemptRemap, patchUrlMappings } from "@discord/embedded-app-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscordUrlMapping } from "../discord-activity/types/DiscordUrlMapping";
import { createUrlRemapper, installDiscordUrlRemap, remapUrlsDeep } from "../discord-activity/urlRemap";
import { LAUNCH_QUERY, loadPage } from "./discordTestUtils";

const MAPPINGS: readonly DiscordUrlMapping[] = [
  { prefix: "/r2/{subdomain}", target: "{subdomain}.r2.cloudflarestorage.com" },
  { prefix: "/clips", target: "clips.example.org" },
];

const PRESIGNED =
  "https://acct123.r2.cloudflarestorage.com/media/lineups/mirage/42.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=ab%2Fcd";
const CLIP = "https://clips.example.org/cs2/mirage/window-smoke.mp4";

/** Where the Activity's own origin serves a proxied path. */
function proxied(pathAndQuery: string): string {
  return `https://${window.location.host}${pathAndQuery}`;
}

const upper = (url: string): string => url.toUpperCase();

beforeEach(() => {
  sessionStorage.clear();
  loadPage("/");
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  loadPage("/");
});

describe("remapUrlsDeep", () => {
  it("rewrites absolute http(s) URLs at any depth", () => {
    const data = {
      lineups: [{ id: 1, media: { url: "https://a.example/x.webp", kind: "image" } }],
      next: "http://b.example/page/2",
    };
    expect(remapUrlsDeep(data, upper)).toEqual({
      lineups: [{ id: 1, media: { url: "HTTPS://A.EXAMPLE/X.WEBP", kind: "image" } }],
      next: "HTTP://B.EXAMPLE/PAGE/2",
    });
  });

  it("leaves everything that isn't an absolute http(s) URL alone", () => {
    const remap = vi.fn(upper);
    const data = {
      path: "/assets/mirage.webp",
      name: "Window smoke",
      count: 3,
      ok: true,
      none: null,
      mail: "mailto:someone@example.org",
      inline: "data:image/png;base64,AAAA",
    };
    expect(remapUrlsDeep(data, remap)).toBe(data);
    expect(remap).not.toHaveBeenCalled();
  });

  it("returns the very same object when nothing changes", () => {
    const data = { items: [{ url: "https://unmapped.example/a.png" }] };
    expect(remapUrlsDeep(data, (url) => url)).toBe(data);
  });

  it("copies only the branches it changes and never mutates its input", () => {
    const untouched = { name: "Mirage", tags: ["smoke"] };
    const data = { map: untouched, media: ["https://a.example/1.webp"] };
    const out = remapUrlsDeep(data, upper) as typeof data;
    expect(out).not.toBe(data);
    expect(out.map).toBe(untouched);
    expect(out.media).toEqual(["HTTPS://A.EXAMPLE/1.WEBP"]);
    expect(data.media).toEqual(["https://a.example/1.webp"]);
  });

  it("does not walk into non-JSON values", () => {
    class Media {
      url = "https://a.example/x.webp";
    }
    const data = { blob: new Blob(["x"]), date: new Date(0), media: new Media() };
    expect(remapUrlsDeep(data, upper)).toBe(data);
  });
});

describe("createUrlRemapper", () => {
  const remap = createUrlRemapper(attemptRemap, MAPPINGS);

  it("routes a presigned R2 URL through the Activity's proxy with its signature intact", () => {
    expect(remap(PRESIGNED)).toBe(
      proxied(
        "/r2/acct123/media/lineups/mirage/42.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=ab%2Fcd",
      ),
    );
  });

  it("routes a fixed host through its prefix", () => {
    expect(remap(CLIP)).toBe(proxied("/clips/cs2/mirage/window-smoke.mp4"));
  });

  it("returns unmapped URLs exactly as given", () => {
    const url = "https://Unmapped.example:443/a%20b?x=1";
    expect(remap(url)).toBe(url);
  });

  it("leaves strings that don't parse as URLs alone", () => {
    expect(remap("https://")).toBe("https://");
  });

  it("leaves the URL alone, with a warning, when a mapping is misconfigured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const broken = createUrlRemapper(attemptRemap, [
      { prefix: "/r2/{bucket}", target: "{subdomain}.r2.cloudflarestorage.com" },
    ]);
    expect(broken(PRESIGNED)).toBe(PRESIGNED);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("misconfigured"), PRESIGNED, expect.any(Error));
  });

  it("rewrites exactly like the SDK's patched fetch", async () => {
    const originalFetch = window.fetch;
    const fetchSpy = vi.fn<typeof fetch>();
    window.fetch = fetchSpy;
    try {
      patchUrlMappings(MAPPINGS.map(({ prefix, target }) => ({ prefix, target })), {
        patchWebSocket: false,
        patchXhr: false,
      });
      await window.fetch(PRESIGNED);
      await window.fetch(CLIP);
    } finally {
      window.fetch = originalFetch;
    }
    const requested = fetchSpy.mock.calls.map(([input]) => String(input));
    expect(requested).toEqual([remap(PRESIGNED), remap(CLIP)]);
  });
});

describe("installDiscordUrlRemap", () => {
  function apiReturning(data: unknown): AxiosInstance {
    const client = axios.create();
    client.defaults.adapter = async (config) => ({ data, status: 200, statusText: "OK", headers: {}, config });
    return client;
  }

  it("does nothing on the website", async () => {
    const data = { image_url: PRESIGNED };
    const client = apiReturning(data);
    const loadSdk = vi.fn(async () => ({ attemptRemap }));
    installDiscordUrlRemap(client, MAPPINGS, { loadSdk });
    const response = await client.get("/lineups");
    expect(response.data).toBe(data);
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it("rewrites the URLs in API responses inside Discord", async () => {
    loadPage(`/${LAUNCH_QUERY}`);
    const loadSdk = vi.fn(async () => ({ attemptRemap }));
    const client = apiReturning({ lineups: [{ image_url: PRESIGNED, clip_url: CLIP, title: "Window smoke" }] });
    installDiscordUrlRemap(client, MAPPINGS, { loadSdk });

    const first = await client.get("/lineups");
    await client.get("/lineups");

    expect(first.data).toEqual({
      lineups: [
        {
          image_url: proxied(
            "/r2/acct123/media/lineups/mirage/42.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=ab%2Fcd",
          ),
          clip_url: proxied("/clips/cs2/mirage/window-smoke.mp4"),
          title: "Window smoke",
        },
      ],
    });
    expect(loadSdk).toHaveBeenCalledTimes(1);
  });

  it("installs nothing without mappings", async () => {
    loadPage(`/${LAUNCH_QUERY}`);
    const data = { image_url: PRESIGNED };
    const client = apiReturning(data);
    const loadSdk = vi.fn(async () => ({ attemptRemap }));
    installDiscordUrlRemap(client, [], { loadSdk });
    expect((await client.get("/lineups")).data).toBe(data);
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it("passes responses through, with a warning, when the SDK can't load", async () => {
    loadPage(`/${LAUNCH_QUERY}`);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const data = { image_url: PRESIGNED };
    const client = apiReturning(data);
    const failure = new TypeError("Failed to fetch dynamically imported module");
    installDiscordUrlRemap(client, MAPPINGS, { loadSdk: () => Promise.reject(failure) });
    expect((await client.get("/lineups")).data).toBe(data);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("failed to load"), failure);
  });
});
