/**
 * Connecting to Discord, against the real Embedded App SDK.
 *
 * The SDK talks to Discord's client over postMessage. These tests play
 * Discord's side — READY and CLOSE frames delivered from the parent frame
 * with an origin the SDK accepts — and check what the Activity sees.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCORD_READY_TIMEOUT_MS,
  DISCORD_SDK_LOAD_TIMEOUT_MS,
  __resetDiscordActivityForTests,
  getDiscordSdk,
  initDiscordActivity,
  type InitDiscordActivityOptions,
} from "../discord-activity/initDiscordActivity";
import { isDiscordActivity } from "../discord-activity/launchParams";
import { loadEmbeddedAppSdk } from "../discord-activity/loadEmbeddedAppSdk";
import type { DiscordUrlMapping } from "../discord-activity/types/DiscordUrlMapping";
import {
  LAUNCH_QUERY,
  READY_FRAME,
  closeFrame,
  constructedClient,
  loadPage,
  postFromDiscord,
  preserveConsole,
  rejection,
  trackedSdk,
  type TrackedSdk,
} from "./discordTestUtils";

const MAPPINGS: readonly DiscordUrlMapping[] = [
  { prefix: "/r2/{subdomain}", target: "{subdomain}.r2.cloudflarestorage.com" },
];

const OPTIONS: InitDiscordActivityOptions = { clientId: "123456789012345678", urlMappings: MAPPINGS };

let sdk: TrackedSdk;
let restoreConsole: () => void;

beforeEach(() => {
  sessionStorage.clear();
  loadPage(`/${LAUNCH_QUERY}`);
  sdk = trackedSdk();
  restoreConsole = preserveConsole();
});

afterEach(() => {
  sdk.teardown();
  restoreConsole();
  vi.useRealTimers();
  vi.restoreAllMocks();
  __resetDiscordActivityForTests();
  sessionStorage.clear();
  loadPage("/");
});

describe("initDiscordActivity", () => {
  it("resolves once Discord answers the handshake with READY", async () => {
    const connecting = initDiscordActivity(OPTIONS, { loadSdk: sdk.load });
    const client = await constructedClient(sdk);
    expect(client.clientId).toBe(OPTIONS.clientId);
    expect(getDiscordSdk()).toBeNull();

    postFromDiscord(READY_FRAME);

    await expect(connecting).resolves.toBe(client);
    expect(getDiscordSdk()).toBe(client);
  });

  it("hands the SDK the launch parameters kept for the session after a deep-link reload", async () => {
    expect(isDiscordActivity()).toBe(true); // first page load keeps the launch parameters
    loadPage("/wow-forever/compare"); // the reload: frame_id is gone from the URL

    const connecting = initDiscordActivity(OPTIONS, { loadSdk: sdk.load });
    const client = await constructedClient(sdk);

    expect(client.instanceId).toBe("instance-1");
    expect(client.platform).toBe("desktop");
    postFromDiscord(READY_FRAME);
    await expect(connecting).resolves.toBe(client);
  });

  it("patches the URL mappings before the handshake starts", async () => {
    const connecting = initDiscordActivity(OPTIONS, { loadSdk: sdk.load });
    await constructedClient(sdk);

    expect(sdk.events).toEqual(["patch", "construct"]);
    expect(sdk.patchUrlMappings).toHaveBeenCalledWith([...MAPPINGS]);
    postFromDiscord(READY_FRAME);
    await connecting;
  });

  it("doesn't patch anything without mappings", async () => {
    const connecting = initDiscordActivity({ ...OPTIONS, urlMappings: [] }, { loadSdk: sdk.load });
    await constructedClient(sdk);
    postFromDiscord(READY_FRAME);
    await connecting;
    expect(sdk.patchUrlMappings).not.toHaveBeenCalled();
  });

  it("fails fast with Discord's close code when Discord closes the connection", async () => {
    const connecting = initDiscordActivity(OPTIONS, { loadSdk: sdk.load });
    await constructedClient(sdk);

    postFromDiscord(closeFrame(4000, "Invalid Client ID"));

    const error = await rejection(connecting);
    expect(error.reason).toBe("closed-by-discord");
    expect(error.code).toBe(4000);
    expect(error.message).toContain("4000: Invalid Client ID");
    expect(getDiscordSdk()).toBeNull();
  });

  it("ignores CLOSE frames from anything but Discord's RPC host", async () => {
    const other = document.createElement("iframe");
    document.body.append(other);
    try {
      const connecting = initDiscordActivity(OPTIONS, { loadSdk: sdk.load });
      const client = await constructedClient(sdk);

      postFromDiscord(closeFrame(4000, "spoofed"), other.contentWindow);
      postFromDiscord(READY_FRAME);

      await expect(connecting).resolves.toBe(client);
    } finally {
      other.remove();
    }
  });

  it("gives up after the READY timeout", async () => {
    vi.useFakeTimers();
    let settled = false;
    const connecting = initDiscordActivity(OPTIONS, { loadSdk: sdk.load });
    void connecting.then(
      () => (settled = true),
      () => (settled = true),
    );
    await constructedClient(sdk);

    await vi.advanceTimersByTimeAsync(DISCORD_READY_TIMEOUT_MS - 1_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);

    const error = await rejection(connecting);
    expect(error.reason).toBe("ready-timeout");
    expect(getDiscordSdk()).toBeNull();
  });

  it("still connects when READY arrives after the timeout", async () => {
    vi.useFakeTimers();
    const connecting = initDiscordActivity({ ...OPTIONS, readyTimeoutMs: 2_000 }, { loadSdk: sdk.load });
    const failed = rejection(connecting);
    const client = await constructedClient(sdk);
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await failed).reason).toBe("ready-timeout");

    postFromDiscord(READY_FRAME);

    await vi.waitFor(() => expect(getDiscordSdk()).toBe(client));
  });

  it("doesn't even load the SDK outside Discord", async () => {
    loadPage("/");
    const loadSdk = vi.fn(sdk.load);
    const error = await rejection(initDiscordActivity(OPTIONS, { loadSdk }));
    expect(error.reason).toBe("not-in-discord");
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it("reports an SDK chunk that fails to load", async () => {
    const cause = new TypeError("Failed to fetch dynamically imported module: https://x.test/assets/sdk.js");
    const error = await rejection(initDiscordActivity(OPTIONS, { loadSdk: () => Promise.reject(cause) }));
    expect(error.reason).toBe("sdk-load-failed");
    expect(error.cause).toBe(cause);
  });

  it("gives up on an SDK chunk that never arrives", async () => {
    vi.useFakeTimers();
    const failed = rejection(initDiscordActivity(OPTIONS, { loadSdk: () => new Promise<never>(() => undefined) }));

    await vi.advanceTimersByTimeAsync(DISCORD_SDK_LOAD_TIMEOUT_MS);

    const error = await failed;
    expect(error.reason).toBe("sdk-load-failed");
    expect(error.message).toContain("took longer than");
    expect(sdk.clients).toHaveLength(0);
  });

  it("reports launch parameters the SDK rejects", async () => {
    loadPage("/?frame_id=frame-1&instance_id=instance-1&platform=web");
    const error = await rejection(initDiscordActivity(OPTIONS, { loadSdk: sdk.load }));
    expect(error.reason).toBe("sdk-init-failed");
    expect(error.message).toContain("platform");
  });

  it("connects once per page — StrictMode's doubled effects share the attempt", async () => {
    const first = initDiscordActivity(OPTIONS, { loadSdk: sdk.load });
    const second = initDiscordActivity(OPTIONS, { loadSdk: sdk.load });
    expect(second).toBe(first);

    await constructedClient(sdk);
    postFromDiscord(READY_FRAME);
    await first;
    expect(sdk.clients).toHaveLength(1);
  });
});

describe("loadEmbeddedAppSdk", () => {
  it("loads the SDK module on demand", async () => {
    const module = await loadEmbeddedAppSdk();
    expect(typeof module.DiscordSDK).toBe("function");
    expect(typeof module.patchUrlMappings).toBe("function");
    expect(typeof module.attemptRemap).toBe("function");
  });
});
