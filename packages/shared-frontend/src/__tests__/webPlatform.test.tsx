/**
 * The browser side of @platform/core: every entry point an app can import first
 * has to leave the platform configured, and the localStorage adapter has to behave
 * as the code it replaced did.
 */
import { configureStore } from "@reduxjs/toolkit";
import { act, renderHook } from "@testing-library/react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENTRY_POINTS: readonly (readonly [string, () => Promise<unknown>])[] = [
  ["store/baseApi", () => import("../store/baseApi")],
  ["store/baseQuery", () => import("../store/baseQuery")],
  ["lib/api", () => import("../lib/api")],
  ["lib/auth-store", () => import("../lib/auth-store")],
  ["auth/stepUpInterceptor", () => import("../auth/stepUpInterceptor")],
  ["auth/stepUpController", () => import("../auth/stepUpController")],
  ["lib/authClient", () => import("../lib/authClient")],
  ["store/totpApi", () => import("../store/totpApi")],
  ["store/userApi", () => import("../store/userApi")],
  ["store/accountApi", () => import("../store/accountApi")],
  ["index", () => import("../index")],
];

function liveToken(): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `header.${payload}.signature`;
}

function okAdapter(seen: InternalAxiosRequestConfig[]): AxiosAdapter {
  return async (config) => {
    seen.push(config);
    return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
  };
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  window.history.pushState({}, "", "/");
});

describe("import order", () => {
  it.each(ENTRY_POINTS)("importing only %s configures the platform", async (_name, load) => {
    await load();
    const { getPlatform } = await import("@platform/core/platform/configurePlatform");
    expect(getPlatform().baseURL).toBe("/api");
  });

  it("sends an authenticated request when baseApi is the first import", async () => {
    localStorage.setItem("token", "jwt-123");
    localStorage.setItem("v1_activeOrgId", "org-456");

    const { baseApi } = await import("../store/baseApi");
    const { default: api } = await import("@platform/core/lib/api");
    const seen: InternalAxiosRequestConfig[] = [];
    api.defaults.adapter = okAdapter(seen);

    const appApi = baseApi.injectEndpoints({
      endpoints: (build) => ({
        getThing: build.query<{ ok: boolean }, void>({
          query: () => ({ url: "/thing" }),
        }),
      }),
    });
    const store = configureStore({
      reducer: { [baseApi.reducerPath]: baseApi.reducer },
      middleware: (getDefault) => getDefault().concat(baseApi.middleware),
    });

    const result = await store.dispatch(appApi.endpoints.getThing.initiate());

    expect(result.data).toEqual({ ok: true });
    expect(seen[0].baseURL).toBe("/api");
    expect(seen[0].headers.Authorization).toBe("Bearer jwt-123");
    expect(seen[0].headers["X-Organization-Id"]).toBe("org-456");
  });
});

describe("the index", () => {
  it("injects no endpoints into baseApi: only the subpath imports do", async () => {
    const { baseApi } = await import("../index");
    expect(Object.keys(baseApi.endpoints)).toEqual([]);
  });
});

describe("the auth client on the web", () => {
  async function loadClient() {
    const { createAuthClient } = await import("../lib/authClient");
    const { default: api } = await import("@platform/core/lib/api");
    return { client: createAuthClient({ dispatch: () => undefined }), api };
  }

  const tokenResponse: AxiosAdapter = async (config) => ({
    data: { access_token: "jwt-123" },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  });

  it("keeps the token from a sign-in in localStorage", async () => {
    const { client, api } = await loadClient();
    api.defaults.adapter = tokenResponse;
    await expect(client.signIn("u@e.com", "pw")).resolves.toEqual({ status: "ok" });
    expect(localStorage.getItem("token")).toBe("jwt-123");
  });

  it("fails the sign-in when localStorage can't keep the token", async () => {
    const { client, api } = await loadClient();
    api.defaults.adapter = tokenResponse;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    await expect(client.signIn("u@e.com", "pw")).rejects.toThrow("Blocked");
    setItem.mockRestore();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("removes the token from localStorage on sign-out", async () => {
    localStorage.setItem("token", "jwt-123");
    const { client } = await loadClient();
    client.signOut();
    expect(localStorage.getItem("token")).toBeNull();
  });
});

describe("the re-exports are the @platform/core modules, not copies", () => {
  it("shares the API client", async () => {
    const shim = await import("../lib/api");
    const core = await import("@platform/core/lib/api");
    expect(shim.default).toBe(core.default);
  });

  it("shares the step-up error classes, so instanceof holds across packages", async () => {
    const shim = await import("../auth/errors/StepUpCancelledError");
    const core = await import("@platform/core/auth/errors/StepUpCancelledError");
    expect(shim.StepUpCancelledError).toBe(core.StepUpCancelledError);
  });
});

describe("the localStorage adapter", () => {
  async function rejectWith401(url = "/things"): Promise<void> {
    const { default: api } = await import("../lib/api");
    const adapter: AxiosAdapter = async (config) =>
      Promise.reject({
        response: { status: 401, statusText: "Err", headers: {}, data: {}, config },
        config,
        isAxiosError: true,
      });
    await expect(api.get(url, { adapter })).rejects.toBeDefined();
  }

  it("signs out on a 401", async () => {
    localStorage.setItem("token", "jwt-123");
    await rejectWith401();
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("stays signed in on a 401 while on /login", async () => {
    localStorage.setItem("token", "jwt-123");
    window.history.pushState({}, "", "/login");
    await rejectWith401();
    expect(localStorage.getItem("token")).toBe("jwt-123");
  });

  it("re-renders useIsAuthenticated when a 401 signs out", async () => {
    localStorage.setItem("token", liveToken());
    const { useIsAuthenticated } = await import("../lib/auth-store");
    const { result } = renderHook(() => useIsAuthenticated());
    expect(result.current).toBe(true);
    await act(() => rejectWith401());
    expect(result.current).toBe(false);
  });

  it("re-renders useIsAuthenticated on another tab's sign-out", async () => {
    localStorage.setItem("token", liveToken());
    const { useIsAuthenticated } = await import("../lib/auth-store");
    const { result } = renderHook(() => useIsAuthenticated());
    expect(result.current).toBe(true);

    localStorage.removeItem("token");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "token" }));
    });
    expect(result.current).toBe(false);
  });

  it("ignores another tab's change to a different key", async () => {
    localStorage.setItem("token", liveToken());
    const { useIsAuthenticated } = await import("../lib/auth-store");
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useIsAuthenticated();
    });
    const before = renders;
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "theme" }));
    });
    expect(renders).toBe(before);
  });

  it("cancels an open step-up prompt on beforeunload", async () => {
    const { request } = await import("../auth/stepUpController");
    const code = request("totp");
    window.dispatchEvent(new Event("beforeunload"));
    await expect(code).rejects.toMatchObject({ reason: "tab_closed" });
  });
});
