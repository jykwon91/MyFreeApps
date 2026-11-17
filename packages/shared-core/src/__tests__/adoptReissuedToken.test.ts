import type { AxiosAdapter } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import api from "../lib/api";
import { notifyAuthChange } from "../lib/auth-store";
import { _resetPlatformForTests, configurePlatform } from "../platform/configurePlatform";
import { axiosBaseQuery } from "../store/baseQuery";

vi.mock("../lib/auth-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/auth-store")>()),
  notifyAuthChange: vi.fn(),
}));

const originalAdapter = api.defaults.adapter;

/**
 * A server whose 2FA routes end the token sent and answer with `reissued`. It accepts only
 * the newest token, as the real one does after the change.
 */
function setUp({
  reissued = "new" as unknown,
  failingSet = false,
  whileAnswering = (_state: { token: string | null }) => {},
} = {}) {
  const state = { token: "old" as string | null, seen: [] as unknown[], valid: "old" };
  const adapter: AxiosAdapter = (config) => {
    state.seen.push(config.headers.Authorization);
    const url = config.url ?? "";
    if (url.endsWith("/auth/totp/verify") || url.endsWith("/auth/totp/disable") || url.endsWith("/auth/other")) {
      if (url.endsWith("/totp/verify") || url.endsWith("/totp/disable")) state.valid = "new";
      whileAnswering(state);
      return Promise.resolve({ data: { access_token: reissued }, status: 200, statusText: "", headers: {}, config });
    }
    const status = config.headers.Authorization === `Bearer ${state.valid}` ? 200 : 401;
    const response = { data: {}, status, statusText: "", headers: {}, config };
    if (status === 200) return Promise.resolve(response);
    return Promise.reject(Object.assign(new Error("401"), { config, response, isAxiosError: true }));
  };
  api.defaults.adapter = adapter;
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: {
      get: () => state.token,
      set: (next) => {
        if (failingSet) throw new Error("storage full");
        state.token = next;
      },
      clear: () => {
        state.token = null;
      },
    },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
  return state;
}

beforeEach(() => {
  vi.mocked(notifyAuthChange).mockClear();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  _resetPlatformForTests();
  vi.restoreAllMocks();
});

describe("a 2FA change that ends every earlier token", () => {
  it.each(["/auth/totp/verify", "/auth/totp/disable"])("%s: the client switches to the new token", async (url) => {
    const state = setUp();

    await api.post(url, { code: "123456" });
    const after = await api.get("/auth/totp/status");

    expect(state.token).toBe("new");
    expect(after.status).toBe(200);
    expect(state.seen).toEqual(["Bearer old", "Bearer new"]);
    expect(notifyAuthChange).toHaveBeenCalledOnce();
  });

  it("switches before the caller sees the response, so a refetch it starts uses the new token", async () => {
    const state = setUp();

    const result = await axiosBaseQuery(
      { url: "/auth/totp/verify", method: "POST", data: { code: "123456" } },
      { signal: new AbortController().signal } as Parameters<typeof axiosBaseQuery>[1],
      {},
    );
    const tokenWhenAnswered = state.token;

    expect(result).toEqual({ data: { access_token: "new" } });
    expect(tokenWhenAnswered).toBe("new");
  });

  it("keeps a sign-in that happened while the request was on its way", async () => {
    const state = setUp({
      whileAnswering: (current) => {
        current.token = "someone-else";
      },
    });

    await api.post("/auth/totp/verify", { code: "123456" });

    expect(state.token).toBe("someone-else");
    expect(notifyAuthChange).not.toHaveBeenCalled();
  });

  it("takes no token from any other route", async () => {
    const state = setUp();

    await api.post("/auth/other", {});

    expect(state.token).toBe("old");
  });

  it("takes nothing when the response carries no token", async () => {
    const state = setUp({ reissued: null });

    await api.post("/auth/totp/verify", { code: "123456" });

    expect(state.token).toBe("old");
  });

  it("still delivers the response when the new token can't be stored", async () => {
    setUp({ failingSet: true });

    const response = await api.post("/auth/totp/verify", { code: "123456" });

    expect(response.data).toEqual({ access_token: "new" });
    expect(notifyAuthChange).not.toHaveBeenCalled();
  });
});
