/**
 * External links: a new tab on the website; Discord's openExternalLink inside
 * an Activity (whose sandbox blocks new tabs).
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { DiscordSdkClient } from "../discord-activity/loadEmbeddedAppSdk";
import { openExternal } from "../discord-activity/openExternal";
import { LAUNCH_QUERY, loadPage } from "./discordTestUtils";

const mocks = vi.hoisted(() => ({
  getDiscordSdk: vi.fn<() => DiscordSdkClient | null>(() => null),
}));

vi.mock("../discord-activity/initDiscordActivity", () => ({ getDiscordSdk: mocks.getDiscordSdk }));

type OpenExternalLink = DiscordSdkClient["commands"]["openExternalLink"];

function connectedClient(openExternalLink: OpenExternalLink): DiscordSdkClient {
  // Only `commands.openExternalLink` is used by openExternal.
  return { commands: { openExternalLink } } as unknown as DiscordSdkClient;
}

const URL_OUT = "https://ko-fi.com/myfreeapps";

let windowOpen: MockInstance<typeof window.open>;

beforeEach(() => {
  sessionStorage.clear();
  loadPage("/");
  mocks.getDiscordSdk.mockReset().mockReturnValue(null);
  windowOpen = vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  loadPage("/");
});

describe("openExternal on the website", () => {
  it("opens a new tab without handing over window.opener", async () => {
    await openExternal(URL_OUT);
    expect(windowOpen).toHaveBeenCalledWith(URL_OUT, "_blank", "noopener,noreferrer");
    expect(mocks.getDiscordSdk).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "/support-myfreeapps", "mailto:someone@example.org", "data:text/html,hi"])(
    "refuses %s",
    async (url) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      await openExternal(url);
      expect(windowOpen).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("refused"), url);
    },
  );
});

describe("openExternal inside a Discord Activity", () => {
  beforeEach(() => loadPage(`/${LAUNCH_QUERY}`));

  it("asks Discord to open the link", async () => {
    const openExternalLink = vi.fn<OpenExternalLink>(async () => ({ opened: true }));
    mocks.getDiscordSdk.mockReturnValue(connectedClient(openExternalLink));

    await openExternal(URL_OUT);

    expect(openExternalLink).toHaveBeenCalledWith({ url: URL_OUT });
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("respects the user saying no in Discord's leaving-Discord prompt", async () => {
    mocks.getDiscordSdk.mockReturnValue(connectedClient(vi.fn<OpenExternalLink>(async () => ({ opened: false }))));
    await openExternal(URL_OUT);
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("logs Discord's error code and falls back to a new tab when the command fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const openExternalLink = vi.fn<OpenExternalLink>(() =>
      Promise.reject({ code: 4006, message: "Invalid permissions" }),
    );
    mocks.getDiscordSdk.mockReturnValue(connectedClient(openExternalLink));

    await openExternal(URL_OUT);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("code=%s message=%s"), 4006, "Invalid permissions");
    expect(windowOpen).toHaveBeenCalledWith(URL_OUT, "_blank", "noopener,noreferrer");
  });

  it("falls back to a new tab while Discord isn't connected", async () => {
    await openExternal(URL_OUT);
    expect(windowOpen).toHaveBeenCalledWith(URL_OUT, "_blank", "noopener,noreferrer");
  });

  it("still refuses non-http(s) URLs", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const openExternalLink = vi.fn<OpenExternalLink>(async () => ({ opened: true }));
    mocks.getDiscordSdk.mockReturnValue(connectedClient(openExternalLink));
    await openExternal("javascript:alert(1)");
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(windowOpen).not.toHaveBeenCalled();
  });
});
