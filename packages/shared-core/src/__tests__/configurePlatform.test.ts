import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StepUpCancelledError } from "../auth/errors/StepUpCancelledError";
import { StepUpReauthRequiredError } from "../auth/errors/StepUpReauthRequiredError";
import { _resetForTests, getState, request } from "../auth/stepUpController";
import api from "../lib/api";
import { notifyAuthChange } from "../lib/auth-store";
import {
  _resetPlatformForTests,
  configurePlatform,
  getPlatform,
  onPlatformConfigured,
} from "../platform/configurePlatform";
import type { PlatformConfig } from "../platform/types/PlatformConfig";
import { axiosBaseQuery } from "../store/baseQuery";

vi.mock("../lib/auth-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/auth-store")>()),
  notifyAuthChange: vi.fn(),
}));

const NOT_CONFIGURED = /@platform\/core is not configured/;

interface Fakes {
  config: PlatformConfig;
  clearToken: ReturnType<typeof vi.fn>;
  fireUnload: () => void;
  unloadListeners: Set<() => void>;
}

function fakePlatform(overrides: Partial<PlatformConfig> = {}): Fakes {
  const clearToken = vi.fn();
  const unloadListeners = new Set<() => void>();
  return {
    clearToken,
    unloadListeners,
    fireUnload: () => unloadListeners.forEach((l) => l()),
    config: {
      baseURL: "https://api.test",
      tokenStore: { get: () => "jwt-123", clear: clearToken },
      orgStore: { get: () => "org-456" },
      isOnLogin: () => false,
      onUnload: (listener) => {
        unloadListeners.add(listener);
        return () => unloadListeners.delete(listener);
      },
      ...overrides,
    },
  };
}

/** Records the request as it leaves, and answers 200. */
function okAdapter(seen: InternalAxiosRequestConfig[]): AxiosAdapter {
  return async (config) => {
    seen.push(config);
    return { data: {}, status: 200, statusText: "OK", headers: {}, config };
  };
}

function failingAdapter(status: number, headers: Record<string, string> = {}): AxiosAdapter {
  return async (config) =>
    Promise.reject({
      response: { status, statusText: "Err", headers, data: {}, config },
      config,
      isAxiosError: true,
    });
}

beforeEach(() => {
  _resetPlatformForTests();
  _resetForTests();
  vi.mocked(notifyAuthChange).mockClear();
});

describe("before configurePlatform()", () => {
  it("rejects a request with a clear error, without sending it", async () => {
    const seen: InternalAxiosRequestConfig[] = [];
    await expect(api.get("/things", { adapter: okAdapter(seen) })).rejects.toThrow(NOT_CONFIGURED);
    expect(seen).toHaveLength(0);
  });

  it("makes getPlatform() throw the same error", () => {
    expect(() => getPlatform()).toThrow(NOT_CONFIGURED);
  });

  it("surfaces the error through the RTK Query base query", async () => {
    const result = await axiosBaseQuery({ url: "/things" }, {} as never, {});
    expect(result.error?.data).toMatch(NOT_CONFIGURED);
  });
});

describe("request headers and base URL", () => {
  it("come from the injected stores and config", async () => {
    configurePlatform(fakePlatform().config);
    const seen: InternalAxiosRequestConfig[] = [];
    await api.get("/things", { adapter: okAdapter(seen) });
    expect(seen[0].headers.Authorization).toBe("Bearer jwt-123");
    expect(seen[0].headers["X-Organization-Id"]).toBe("org-456");
    expect(seen[0].baseURL).toBe("https://api.test");
  });

  it("are read on every request, not cached at configure time", async () => {
    let token: string | null = "first";
    configurePlatform(
      fakePlatform({ tokenStore: { get: () => token, clear: () => {} } }).config,
    );
    const seen: InternalAxiosRequestConfig[] = [];
    await api.get("/things", { adapter: okAdapter(seen) });
    token = "second";
    await api.get("/things", { adapter: okAdapter(seen) });
    expect(seen.map((c) => c.headers.Authorization)).toEqual(["Bearer first", "Bearer second"]);
  });

  it("are left off when the stores are empty", async () => {
    configurePlatform(
      fakePlatform({
        tokenStore: { get: () => null, clear: () => {} },
        orgStore: { get: () => null },
      }).config,
    );
    const seen: InternalAxiosRequestConfig[] = [];
    await api.get("/things", { adapter: okAdapter(seen) });
    expect(seen[0].headers.Authorization).toBeUndefined();
    expect(seen[0].headers["X-Organization-Id"]).toBeUndefined();
  });

  it("keep a request's own Authorization", async () => {
    configurePlatform(fakePlatform().config);
    const seen: InternalAxiosRequestConfig[] = [];
    await api.get("/things", {
      adapter: okAdapter(seen),
      headers: { Authorization: "RaidPlanner abc" },
    });
    expect(seen[0].headers.Authorization).toBe("RaidPlanner abc");
  });

  it("follow a later configurePlatform()", async () => {
    configurePlatform(fakePlatform().config);
    configurePlatform(fakePlatform({ baseURL: "https://other.test" }).config);
    const seen: InternalAxiosRequestConfig[] = [];
    await api.get("/things", { adapter: okAdapter(seen) });
    expect(seen[0].baseURL).toBe("https://other.test");
  });
});

describe("401 handling", () => {
  it("clears the injected token store and notifies on a plain 401", async () => {
    const { config, clearToken } = fakePlatform();
    configurePlatform(config);
    await expect(api.get("/things", { adapter: failingAdapter(401) })).rejects.toBeDefined();
    expect(clearToken).toHaveBeenCalledTimes(1);
    expect(notifyAuthChange).toHaveBeenCalledTimes(1);
  });

  it("leaves the token alone when the injected isOnLogin() says so", async () => {
    const { config, clearToken } = fakePlatform({ isOnLogin: () => true });
    configurePlatform(config);
    await expect(api.get("/things", { adapter: failingAdapter(401) })).rejects.toBeDefined();
    expect(clearToken).not.toHaveBeenCalled();
    expect(notifyAuthChange).not.toHaveBeenCalled();
  });

  it("leaves the token alone on a 401 from an auth endpoint", async () => {
    const { config, clearToken } = fakePlatform();
    configurePlatform(config);
    await expect(api.post("/auth/login", {}, { adapter: failingAdapter(401) })).rejects.toBeDefined();
    expect(clearToken).not.toHaveBeenCalled();
  });

  it("clears the injected token store on a step-up reauth 401", async () => {
    const { config, clearToken } = fakePlatform();
    configurePlatform(config);
    await expect(
      api.get("/things", { adapter: failingAdapter(401, { "x-require-step-up": "reauth" }) }),
    ).rejects.toBeInstanceOf(StepUpReauthRequiredError);
    expect(clearToken).toHaveBeenCalledTimes(1);
    expect(notifyAuthChange).toHaveBeenCalledTimes(1);
  });

  it("keeps the token through a step-up TOTP 401", async () => {
    const { config, clearToken } = fakePlatform();
    configurePlatform(config);
    const pending = api.get("/things", {
      adapter: failingAdapter(401, { "x-require-step-up": "totp" }),
    });
    await vi.waitFor(() => expect(getState().pending).not.toBeNull());
    expect(clearToken).not.toHaveBeenCalled();
    _resetForTests();
    void pending.catch(() => {});
  });
});

describe("a listener that throws", () => {
  it("still configures everything else, then surfaces the failure", () => {
    let shouldThrow = true;
    onPlatformConfigured(() => {
      if (shouldThrow) throw new Error("boom");
    });
    const later = vi.fn();
    onPlatformConfigured(later);
    const { config } = fakePlatform();

    expect(() => configurePlatform(config)).toThrow("boom");
    shouldThrow = false;

    expect(later).toHaveBeenCalledWith(config);
    expect(getPlatform()).toBe(config);
    expect(api.defaults.baseURL).toBe("https://api.test");
  });
});

describe("onUnload", () => {
  it("cancels an open step-up prompt when the injected signal fires", async () => {
    const { config, fireUnload } = fakePlatform();
    configurePlatform(config);
    const code = request("totp");
    fireUnload();
    await expect(code).rejects.toBeInstanceOf(StepUpCancelledError);
    await expect(code).rejects.toMatchObject({ reason: "tab_closed" });
  });

  it("does nothing when no prompt is open", () => {
    const { config, fireUnload } = fakePlatform();
    configurePlatform(config);
    fireUnload();
    expect(getState().pending).toBeNull();
  });

  it("is optional, and dropping it removes the previous listener", () => {
    const first = fakePlatform();
    configurePlatform(first.config);
    expect(first.unloadListeners.size).toBe(1);

    const { config } = fakePlatform({ onUnload: undefined });
    expect(() => configurePlatform(config)).not.toThrow();
    expect(first.unloadListeners.size).toBe(0);
  });

  it("removes the previous listener on a later configurePlatform()", () => {
    const first = fakePlatform();
    const second = fakePlatform();
    configurePlatform(first.config);
    expect(first.unloadListeners.size).toBe(1);
    configurePlatform(second.config);
    expect(first.unloadListeners.size).toBe(0);
    expect(second.unloadListeners.size).toBe(1);
  });
});
