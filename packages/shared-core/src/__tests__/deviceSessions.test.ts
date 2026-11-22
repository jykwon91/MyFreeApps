// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fetchDevices, revokeDevice } from "../auth/deviceSessions";
import { useDevices } from "../hooks/useDevices";
import api from "../lib/api";
import { _resetPlatformForTests, configurePlatform } from "../platform/configurePlatform";
import type { SignedInDevice } from "../types/security/signed-in-device";
import { deviceSignOutMessage } from "../utils/deviceSignOutMessage";
import { devicesInDisplayOrder } from "../utils/devicesInDisplayOrder";

const originalAdapter = api.defaults.adapter;

const PIXEL: SignedInDevice = { id: "p", device_name: "Pixel", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-10-02T00:00:00Z" };
const IPHONE: SignedInDevice = { id: "i", device_name: "iPhone", created_at: "2026-10-01T00:00:00Z", last_used_at: "2026-10-05T00:00:00Z" };

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  const response = { status, data, statusText: "", headers: {}, config };
  if (status < 400) return response;
  throw Object.assign(new Error(String(status)), { isAxiosError: true, config, response });
}

function lost(config: InternalAxiosRequestConfig): never {
  throw Object.assign(new Error("Network Error"), { isAxiosError: true, config });
}

/** Answers GET /auth/mobile/sessions and DELETE with the handlers given, in turn. */
function server(handlers: { list: Array<(c: InternalAxiosRequestConfig) => unknown>; revoke?: (c: InternalAxiosRequestConfig) => unknown }) {
  const seen: string[] = [];
  const adapter: AxiosAdapter = async (config) => {
    seen.push(`${config.method} ${config.url}`);
    if (config.method === "delete") return (handlers.revoke ?? ((c) => reply(c, 204, null)))(config) as never;
    const next = handlers.list.shift();
    if (!next) throw new Error("no list answer left");
    return next(config) as never;
  };
  api.defaults.adapter = adapter;
  return seen;
}

beforeEach(() => {
  _resetPlatformForTests();
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: { get: () => null, set: () => {}, clear: () => {} },
    orgStore: { get: () => null },
    isOnLogin: () => false,
    refreshSession: async () => "unavailable",
  });
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
});

describe("device session calls", () => {
  it("lists devices and signs one out by its id", async () => {
    const seen = server({ list: [(c) => reply(c, 200, [PIXEL])] });
    await expect(fetchDevices()).resolves.toEqual([PIXEL]);
    await revokeDevice("a/b");
    expect(seen).toEqual(["get /auth/mobile/sessions", "delete /auth/mobile/sessions/a%2Fb"]);
  });
});

describe("useDevices", () => {
  async function loaded() {
    const hook = renderHook(() => useDevices());
    await act(() => hook.result.current.reload());
    return hook;
  }

  it("loads nothing until asked, then the list", async () => {
    server({ list: [(c) => reply(c, 200, [PIXEL, IPHONE])] });
    const hook = renderHook(() => useDevices());
    expect(hook.result.current.devices).toBeNull();
    await act(() => hook.result.current.reload());
    expect(hook.result.current.devices).toEqual([PIXEL, IPHONE]);
    expect(hook.result.current.hasError).toBe(false);
  });

  it("reports a list that wouldn't load", async () => {
    server({ list: [lost] });
    const { result } = await loaded();
    expect(result.current.hasError).toBe(true);
    expect(result.current.devices).toBeNull();
  });

  it("drops a signed-out device from the list", async () => {
    server({ list: [(c) => reply(c, 200, [PIXEL, IPHONE])] });
    const { result } = await loaded();
    await act(async () => expect(await result.current.signOutDevice("p")).toBe("signedOut"));
    expect(result.current.devices).toEqual([IPHONE]);
  });

  it("calls a 404 already gone", async () => {
    server({ list: [(c) => reply(c, 200, [PIXEL])], revoke: (c) => reply(c, 404, { detail: "Session not found" }) });
    const { result } = await loaded();
    await act(async () => expect(await result.current.signOutDevice("p")).toBe("alreadyGone"));
    expect(result.current.devices).toEqual([]);
  });

  it("checks the list after a lost answer: off it means signed out", async () => {
    server({ list: [(c) => reply(c, 200, [PIXEL, IPHONE]), (c) => reply(c, 200, [IPHONE])], revoke: lost });
    const { result } = await loaded();
    await act(async () => expect(await result.current.signOutDevice("p")).toBe("signedOut"));
    expect(result.current.devices).toEqual([IPHONE]);
  });

  it("rejects after a lost answer when the device is still listed", async () => {
    server({ list: [(c) => reply(c, 200, [PIXEL]), (c) => reply(c, 200, [PIXEL])], revoke: lost });
    const { result } = await loaded();
    await act(() => expect(result.current.signOutDevice("p")).rejects.toThrow("Network Error"));
  });

  it("is unsure when neither the sign-out nor the list answered", async () => {
    server({ list: [(c) => reply(c, 200, [PIXEL]), lost], revoke: lost });
    const { result } = await loaded();
    await act(async () => expect(await result.current.signOutDevice("p")).toBe("unsure"));
    expect(result.current.devices).toEqual([PIXEL]);
  });

  it("rejects a real refusal without reading the list again", async () => {
    const seen = server({ list: [(c) => reply(c, 200, [PIXEL])], revoke: (c) => reply(c, 403, { detail: "Not allowed" }) });
    const { result } = await loaded();
    await act(() => expect(result.current.signOutDevice("p")).rejects.toThrow());
    expect(seen.filter((call) => call.startsWith("get"))).toHaveLength(1);
  });
});

describe("devicesInDisplayOrder", () => {
  it("puts the current device first, then the most recently used", () => {
    expect(devicesInDisplayOrder([PIXEL, IPHONE], "p").map((d) => d.id)).toEqual(["p", "i"]);
    expect(devicesInDisplayOrder([PIXEL, IPHONE], null).map((d) => d.id)).toEqual(["i", "p"]);
  });
});

describe("deviceSignOutMessage", () => {
  it.each([
    ["signedOut", "Signed out Pixel. It may stay signed in for up to 30 minutes.", "success"],
    ["alreadyGone", "That device was already signed out.", "success"],
    ["unsure", "I didn't get an answer, so I'm not sure Pixel was signed out. Trying again is safe.", "error"],
    [null, "Couldn't sign out Pixel. Check your connection and try again.", "error"],
  ] as const)("%s", (outcome, message, variant) => {
    expect(deviceSignOutMessage(outcome, "Pixel")).toEqual({ message, variant });
  });
});
