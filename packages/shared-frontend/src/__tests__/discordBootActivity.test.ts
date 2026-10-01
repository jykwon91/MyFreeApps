/**
 * bootDiscordActivity: application id first, then the SDK handshake — with
 * every failure logged with its reason and Discord's code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetDiscordBootForTests, bootDiscordActivity } from "../discord-activity/bootDiscordActivity";
import { __resetDiscordActivityForTests } from "../discord-activity/initDiscordActivity";
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

const CLIENT_ID = "123456789012345678";

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
  vi.restoreAllMocks();
  __resetDiscordBootForTests();
  __resetDiscordActivityForTests();
  sessionStorage.clear();
  loadPage("/");
});

describe("bootDiscordActivity", () => {
  it("fetches the application id, then connects with it", async () => {
    const loadClientId = vi.fn(async () => ` ${CLIENT_ID}\n`);
    const booting = bootDiscordActivity({ loadClientId, urlMappings: [] }, { loadSdk: sdk.load });

    const client = await constructedClient(sdk);
    expect(client.clientId).toBe(CLIENT_ID);
    postFromDiscord(READY_FRAME);

    await expect(booting).resolves.toBeUndefined();
  });

  it.each([
    ["the request fails", () => Promise.reject(new Error("Network Error"))],
    ["the id is empty", () => Promise.resolve("  ")],
  ])("reports client-id-unavailable when %s", async (_label, loadClientId) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const error = await rejection(bootDiscordActivity({ loadClientId, urlMappings: [] }, { loadSdk: sdk.load }));

    expect(error.reason).toBe("client-id-unavailable");
    expect(sdk.clients).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("reason=%s code=%s"),
      "client-id-unavailable",
      "none",
      error.message,
      error.cause,
    );
  });

  it("logs Discord's close code when Discord refuses the connection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const booting = bootDiscordActivity(
      { loadClientId: async () => CLIENT_ID, urlMappings: [] },
      { loadSdk: sdk.load },
    );
    await constructedClient(sdk);

    postFromDiscord(closeFrame(4000, "Invalid Client ID"));

    const error = await rejection(booting);
    expect(error.reason).toBe("closed-by-discord");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("reason=%s code=%s"),
      "closed-by-discord",
      4000,
      error.message,
      undefined,
    );
  });

  it("starts downloading the SDK while the application id loads", async () => {
    let releaseId: (id: string) => void = () => undefined;
    const loadSdk = vi.fn(sdk.load);
    const booting = bootDiscordActivity(
      {
        loadClientId: () =>
          new Promise<string>((resolve) => {
            releaseId = resolve;
          }),
        urlMappings: [],
      },
      { loadSdk },
    );

    expect(loadSdk).toHaveBeenCalledTimes(1);
    releaseId(CLIENT_ID);
    await constructedClient(sdk);
    postFromDiscord(READY_FRAME);
    await booting;
  });

  it("boots once per page", async () => {
    const loadClientId = vi.fn(async () => CLIENT_ID);
    const first = bootDiscordActivity({ loadClientId, urlMappings: [] }, { loadSdk: sdk.load });
    const second = bootDiscordActivity({ loadClientId, urlMappings: [] }, { loadSdk: sdk.load });
    expect(second).toBe(first);

    await constructedClient(sdk);
    postFromDiscord(READY_FRAME);
    await first;
    expect(loadClientId).toHaveBeenCalledTimes(1);
  });
});
