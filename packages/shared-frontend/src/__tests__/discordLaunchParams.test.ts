/**
 * Inside / outside Discord detection.
 *
 * Discord launches an Activity with `?frame_id=…&instance_id=…&platform=…`.
 * The website (no frame_id) must never switch into Activity mode, and an
 * Activity must stay one after client-side navigation and reloads (stale
 * chunk recovery, "Try again"), which both drop the query string.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCORD_LAUNCH_STORAGE_KEY,
  getDiscordLaunchSearch,
  isDiscordActivity,
  withoutDiscordLaunchParams,
} from "../discord-activity/launchParams";
import { LAUNCH_QUERY, loadPage } from "./discordTestUtils";

beforeEach(() => {
  sessionStorage.clear();
  loadPage("/");
});

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  loadPage("/");
});

describe("isDiscordActivity", () => {
  it("is false on the website", () => {
    expect(isDiscordActivity()).toBe(false);
    expect(getDiscordLaunchSearch()).toBeNull();
  });

  it.each(["/?tab=forms", "/?frame_id=", "/?instance_id=instance-1&platform=desktop"])(
    "is false for %s (no usable frame_id)",
    (url) => {
      loadPage(url);
      expect(isDiscordActivity()).toBe(false);
    },
  );

  it("is true when Discord launched the page", () => {
    loadPage(`/${LAUNCH_QUERY}`);
    expect(isDiscordActivity()).toBe(true);
  });

  it("stays true after client-side navigation drops the query string", () => {
    loadPage(`/${LAUNCH_QUERY}`);
    expect(isDiscordActivity()).toBe(true);
    window.history.pushState(null, "", "/cs2/maps/mirage");
    expect(isDiscordActivity()).toBe(true);
  });

  it("stays true after a reload on a deep link", () => {
    loadPage(`/${LAUNCH_QUERY}`);
    expect(isDiscordActivity()).toBe(true);
    loadPage("/wow-forever/compare");
    expect(isDiscordActivity()).toBe(true);
    expect(getDiscordLaunchSearch()).toBe(LAUNCH_QUERY);
  });

  it("is decided once per page — a later URL change can't turn the website into an Activity", () => {
    expect(isDiscordActivity()).toBe(false);
    window.history.pushState(null, "", `/${LAUNCH_QUERY}`);
    expect(isDiscordActivity()).toBe(false);
  });

  it("ignores a stored value without frame_id", () => {
    sessionStorage.setItem(DISCORD_LAUNCH_STORAGE_KEY, "?instance_id=instance-1&platform=desktop");
    loadPage("/");
    expect(isDiscordActivity()).toBe(false);
  });

  it("still detects Discord when the browser blocks sessionStorage", () => {
    const blocked = (): never => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
    loadPage(`/${LAUNCH_QUERY}`);
    expect(isDiscordActivity()).toBe(true);
  });
});

describe("getDiscordLaunchSearch", () => {
  it("keeps only Discord's launch parameters", () => {
    loadPage(
      "/?tab=forms&platform=mobile&frame_id=frame-1&utm_source=x&instance_id=instance-1&guild_id=g-1&channel_id=c-1",
    );
    expect(getDiscordLaunchSearch()).toBe(
      "?frame_id=frame-1&instance_id=instance-1&platform=mobile&guild_id=g-1&channel_id=c-1",
    );
  });

  it("remembers the launch parameters for this tab", () => {
    loadPage(`/${LAUNCH_QUERY}&tab=forms`);
    getDiscordLaunchSearch();
    expect(sessionStorage.getItem(DISCORD_LAUNCH_STORAGE_KEY)).toBe(LAUNCH_QUERY);
  });

  it("re-validates what it reads back from storage", () => {
    sessionStorage.setItem(DISCORD_LAUNCH_STORAGE_KEY, `${LAUNCH_QUERY}&next=https://evil.example`);
    loadPage("/");
    expect(getDiscordLaunchSearch()).toBe(LAUNCH_QUERY);
  });
});

describe("withoutDiscordLaunchParams", () => {
  it.each([
    [LAUNCH_QUERY, ""],
    [`${LAUNCH_QUERY}&tab=forms`, "?tab=forms"],
    ["?tab=forms&form=schedule_e", "?tab=forms&form=schedule_e"],
    ["", ""],
    [
      "?guild_id=g-1&channel_id=c-1&location_id=l-1&custom_id=x&referrer_id=r-1&mobile_app_version=250.0&q=mirage",
      "?q=mirage",
    ],
  ])("%s -> %s", (search, expected) => {
    expect(withoutDiscordLaunchParams(search)).toBe(expected);
  });
});
