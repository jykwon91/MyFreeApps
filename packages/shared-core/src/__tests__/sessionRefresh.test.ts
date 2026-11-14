import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StepUpReauthRequiredError } from "../auth/errors/StepUpReauthRequiredError";
import { _resetForTests as _resetStepUpForTests, getState as getStepUpState, submitCode } from "../auth/stepUpController";
import { ORGANIZATION_HEADER } from "../constants/organizationHeader";
import { REFRESH_COOLDOWN_MS } from "../constants/sessionRefresh";
import api from "../lib/api";
import { notifyAuthChange } from "../lib/auth-store";
import { _resetSessionRefreshForTests, refreshSessionOnce } from "../lib/session-refresh";
import { exemptFromSignOut, isExemptFromSignOut } from "../lib/signOutExemptions";
import { _resetPlatformForTests, configurePlatform } from "../platform/configurePlatform";
import type { PlatformConfig } from "../platform/types/PlatformConfig";
import type { SessionRefreshResult } from "../platform/types/SessionRefreshResult";

vi.mock("../lib/auth-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/auth-store")>()),
  notifyAuthChange: vi.fn(),
}));

const originalAdapter = api.defaults.adapter;

function respond(config: InternalAxiosRequestConfig, status: number, headers = {}): ReturnType<AxiosAdapter> {
  const response = { data: {}, status, statusText: "", headers, config };
  if (status < 400) return Promise.resolve(response);
  return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
}

/** The server accepts only `validToken`, and records every Authorization it sees. */
function serverAccepting(state: { validToken: string; seen: unknown[] }): AxiosAdapter {
  return (config) => {
    const authorization = config.headers.Authorization;
    state.seen.push(authorization);
    return respond(config, authorization === `Bearer ${state.validToken}` ? 200 : 401);
  };
}

function setUp(refresh: () => Promise<SessionRefreshResult>, overrides: Partial<PlatformConfig> = {}) {
  let token: string | null = "old";
  const clear = vi.fn(() => {
    token = null;
  });
  const server = { validToken: "new", seen: [] as unknown[] };
  api.defaults.adapter = serverAccepting(server);
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: {
      get: () => token,
      set: (next) => {
        token = next;
      },
      clear,
    },
    orgStore: { get: () => null },
    isOnLogin: () => false,
    refreshSession: refresh,
    ...overrides,
  });
  return {
    server,
    clear,
    setToken: (next: string) => {
      token = next;
    },
  };
}

beforeEach(() => {
  vi.mocked(notifyAuthChange).mockClear();
  _resetSessionRefreshForTests();
  _resetStepUpForTests();
});

afterEach(() => {
  vi.useRealTimers();
  api.defaults.adapter = originalAdapter;
  _resetPlatformForTests();
});

describe("a rejected access token", () => {
  it("is refreshed and the request retried with the new one", async () => {
    let harness: ReturnType<typeof setUp> | undefined = undefined;
    const refresh = vi.fn(async () => {
      harness?.setToken("new");
      return "refreshed" as const;
    });
    harness = setUp(refresh);

    const response = await api.get("/recipes");

    expect(response.status).toBe(200);
    expect(refresh).toHaveBeenCalledOnce();
    expect(harness.server.seen).toEqual(["Bearer old", "Bearer new"]);
    expect(harness.clear).not.toHaveBeenCalled();
  });

  it("shares one refresh between requests rejected together", async () => {
    let harness: ReturnType<typeof setUp> | undefined = undefined;
    const refresh = vi.fn(async () => {
      await Promise.resolve();
      harness?.setToken("new");
      return "refreshed" as const;
    });
    harness = setUp(refresh);

    const responses = await Promise.all([api.get("/a"), api.get("/b"), api.get("/c")]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("doesn't refresh again for a request sent before the last refresh", async () => {
    const refresh = vi.fn(async () => "refreshed" as const);
    const harness = setUp(refresh);
    const seen: unknown[] = [];
    api.defaults.adapter = (config) => {
      seen.push(config.headers.Authorization);
      if (seen.length === 1) {
        // The token changes while this request is on its way back.
        harness.setToken("new");
        return respond(config, 401);
      }
      return respond(config, 200);
    };

    await api.get("/recipes");

    expect(refresh).not.toHaveBeenCalled();
    expect(seen).toEqual(["Bearer old", "Bearer new"]);
  });

  it("signs out only when the server says the session is over", async () => {
    const harness = setUp(async () => "signed_out");
    await expect(api.get("/recipes")).rejects.toMatchObject({ response: { status: 401 } });
    expect(harness.clear).toHaveBeenCalledOnce();
    expect(notifyAuthChange).toHaveBeenCalledOnce();
  });

  it.each([
    ["no answer", async (): Promise<SessionRefreshResult> => "unavailable"],
    ["a refresh that throws", async (): Promise<SessionRefreshResult> => { throw new Error("offline"); }],
  ])("keeps the user signed in after %s", async (_name, refresh) => {
    const harness = setUp(refresh);
    await expect(api.get("/recipes")).rejects.toMatchObject({ response: { status: 401 } });
    expect(harness.clear).not.toHaveBeenCalled();
    expect(notifyAuthChange).not.toHaveBeenCalled();
  });

  it("retries once, however the retry turns out", async () => {
    const refresh = vi.fn(async () => "refreshed" as const);
    const harness = setUp(refresh);
    harness.setToken("old");
    harness.server.validToken = "never";
    await expect(api.get("/recipes")).rejects.toMatchObject({ response: { status: 401 } });
    expect(refresh).toHaveBeenCalledOnce();
    expect(harness.server.seen).toHaveLength(2);
    expect(harness.clear).not.toHaveBeenCalled();
  });

  it.each(["/auth/mobile/login", "/auth/mobile/refresh", "/auth/mobile/logout", "/auth/totp/login", "/auth/jwt/login"])(
    "isn't refreshed for %s",
    async (url) => {
      const refresh = vi.fn(async () => "refreshed" as const);
      setUp(refresh);
      await expect(api.post(url)).rejects.toMatchObject({ response: { status: 401 } });
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  it("is refreshed for the signed-in auth routes", async () => {
    let harness: ReturnType<typeof setUp> | undefined = undefined;
    const refresh = vi.fn(async () => {
      harness?.setToken("new");
      return "refreshed" as const;
    });
    harness = setUp(refresh);
    expect((await api.get("/auth/mobile/sessions")).status).toBe(200);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("leaves a step-up 401 to the step-up flow", async () => {
    const refresh = vi.fn(async () => "refreshed" as const);
    setUp(refresh);
    api.defaults.adapter = (config) => respond(config, 401, { "x-require-step-up": "reauth" });
    await expect(api.get("/admin")).rejects.toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("sharing a refresh", () => {
  it("covers a refresh started at launch and a request rejected during it", async () => {
    let harness: ReturnType<typeof setUp> | undefined = undefined;
    let finish: () => void = () => {};
    const refresh = vi.fn(
      () =>
        new Promise<SessionRefreshResult>((resolve) => {
          finish = () => {
            harness?.setToken("new");
            resolve("refreshed");
          };
        }),
    );
    harness = setUp(refresh);

    const launch = refreshSessionOnce();
    const request = api.get("/recipes");
    await vi.waitFor(() => expect(harness?.server.seen).toEqual(["Bearer old"]));
    finish();

    await expect(launch).resolves.toBe("refreshed");
    expect((await request).status).toBe(200);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("starts a new refresh for a token that expires later", async () => {
    let harness: ReturnType<typeof setUp> | undefined = undefined;
    const refresh = vi.fn(async () => {
      harness?.setToken("new");
      return "refreshed" as const;
    });
    harness = setUp(refresh);

    await api.get("/first");
    harness.setToken("expired");
    await api.get("/second");

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("signs out once when several requests are refused together", async () => {
    const harness = setUp(async () => "signed_out");
    const results = await Promise.allSettled([api.get("/a"), api.get("/b"), api.get("/c")]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(harness.clear).toHaveBeenCalledOnce();
    expect(notifyAuthChange).toHaveBeenCalledOnce();
  });

  it("doesn't sign out a session that replaced the refused one", async () => {
    let harness: ReturnType<typeof setUp> | undefined = undefined;
    const refresh = vi.fn(async (): Promise<SessionRefreshResult> => {
      harness?.setToken("new");
      return "signed_out";
    });
    harness = setUp(refresh);

    await expect(refreshSessionOnce()).resolves.toBe("refreshed");
    expect(harness.clear).not.toHaveBeenCalled();
    expect(notifyAuthChange).not.toHaveBeenCalled();
  });

  it("waits a moment after no answer before asking again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const refresh = vi.fn(async (): Promise<SessionRefreshResult> => "unavailable");
    setUp(refresh);

    await expect(api.get("/first")).rejects.toBeDefined();
    await expect(api.get("/soon")).rejects.toBeDefined();
    expect(refresh).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(REFRESH_COOLDOWN_MS);
    await expect(api.get("/later")).rejects.toBeDefined();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("lets a retry at launch through the wait", async () => {
    const refresh = vi.fn(async (): Promise<SessionRefreshResult> => "unavailable");
    setUp(refresh);
    await refreshSessionOnce();
    await refreshSessionOnce();
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("what a retry sends", () => {
  it("replays a body", async () => {
    let harness: ReturnType<typeof setUp> | undefined = undefined;
    harness = setUp(async () => {
      harness?.setToken("new");
      return "refreshed";
    });
    const bodies: unknown[] = [];
    const accept = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = (config) => {
      bodies.push(config.data);
      return accept(config);
    };

    await api.post("/recipes", { title: "Soup" });

    expect(bodies).toEqual([JSON.stringify({ title: "Soup" }), JSON.stringify({ title: "Soup" })]);
  });

  it("goes to the workspace the request started in, after a switch during the refresh", async () => {
    let workspace = "A";
    let harness: ReturnType<typeof setUp> | undefined = undefined;
    harness = setUp(
      async () => {
        workspace = "B";
        harness?.setToken("new");
        return "refreshed";
      },
      { orgStore: { get: () => workspace } },
    );
    const sentTo: unknown[] = [];
    const accept = api.defaults.adapter as AxiosAdapter;
    api.defaults.adapter = (config) => {
      sentTo.push(config.headers[ORGANIZATION_HEADER]);
      return accept(config);
    };

    expect((await api.post("/documents/upload", {})).status).toBe(200);
    expect(sentTo).toEqual(["A", "A"]);
    expect((await api.get("/documents")).status).toBe(200);
    expect(sentTo).toEqual(["A", "A", "B"]);
  });

  it("keeps a caller's own Authorization and leaves its 401 alone", async () => {
    const refresh = vi.fn(async () => "refreshed" as const);
    const harness = setUp(refresh);
    for (const authorization of ["Basic abc", "Bearer theirs"]) {
      await expect(api.get("/elsewhere", { headers: { Authorization: authorization } })).rejects.toBeDefined();
    }
    expect(refresh).not.toHaveBeenCalled();
    expect(harness.server.seen).toEqual(["Basic abc", "Bearer theirs"]);
    expect(harness.clear).not.toHaveBeenCalled();
  });

  it("sends the current token when a step-up code replays the request", async () => {
    const harness = setUp(async () => "refreshed");
    const seen: unknown[] = [];
    api.defaults.adapter = (config) => {
      seen.push(config.headers.Authorization);
      if (config.headers["X-TOTP-Code"]) return respond(config, 200);
      harness.setToken("new");
      return respond(config, 401, { "x-require-step-up": "totp" });
    };

    const request = api.get("/admin");
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    await vi.waitFor(() => expect(getStepUpState().pending).not.toBeNull());
    submitCode("123456");

    expect((await request).status).toBe(200);
    expect(seen).toEqual(["Bearer old", "Bearer new"]);
  });
});

describe("after the server demands a new sign-in", () => {
  it("doesn't bring the session back", async () => {
    let refreshToken: string | null = "stored";
    let token: string | null = "old";
    const refresh = vi.fn(async (): Promise<SessionRefreshResult> => {
      if (refreshToken === null) return "signed_out";
      token = "restored";
      return "refreshed";
    });
    configurePlatform({
      baseURL: "https://api.test",
      tokenStore: {
        get: () => token,
        set: (next) => {
          token = next;
        },
        clear: () => {
          token = null;
          refreshToken = null;
        },
      },
      orgStore: { get: () => null },
      isOnLogin: () => false,
      refreshSession: refresh,
    });
    api.defaults.adapter = (config) => respond(config, 401, { "x-require-step-up": "reauth" });
    await expect(api.get("/admin")).rejects.toBeInstanceOf(StepUpReauthRequiredError);

    // A screen that's still open fires one more request.
    api.defaults.adapter = (config) => respond(config, 401);
    await expect(api.get("/recipes")).rejects.toMatchObject({ response: { status: 401 } });

    expect(token).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("when another account signs in during a request", () => {
  it("doesn't send the request again as that account", async () => {
    let account = "a@example.com";
    let token = "old";
    const seen: unknown[] = [];
    api.defaults.adapter = (config) => {
      seen.push(config.headers.Authorization);
      return respond(config, 401);
    };
    configurePlatform({
      baseURL: "https://api.test",
      tokenStore: { get: () => token, set: () => {}, clear: () => {} },
      orgStore: { get: () => null },
      isOnLogin: () => false,
      currentAccount: () => account,
      refreshSession: async () => {
        account = "b@example.com";
        token = "b-token";
        return "refreshed";
      },
    });

    await expect(api.get("/recipes")).rejects.toMatchObject({ response: { status: 401 } });

    expect(seen).toEqual(["Bearer old"]);
  });
});

describe("a platform with no refresh", () => {
  it("still signs out on a rejected token", async () => {
    const clear = vi.fn();
    api.defaults.adapter = (config) => respond(config, 401);
    configurePlatform({
      baseURL: "https://api.test",
      tokenStore: { get: () => "old", set: () => {}, clear },
      orgStore: { get: () => null },
      isOnLogin: () => false,
    });
    await expect(api.get("/recipes")).rejects.toBeDefined();
    expect(clear).toHaveBeenCalledOnce();
  });
});

describe("URLs exempt from sign-out", () => {
  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    _resetPlatformForTests();
  });

  it("hands a 401 to the caller without refreshing or signing out", async () => {
    const refreshSession = vi.fn<() => Promise<SessionRefreshResult>>();
    const clear = vi.fn();
    configurePlatform({
      baseURL: "/api",
      tokenStore: { get: () => "token", set: vi.fn(), clear },
      orgStore: { get: () => null },
      isOnLogin: () => false,
      refreshSession,
    });
    exemptFromSignOut(["/integrations/gmail/sync"]);
    api.defaults.adapter = (config) => respond(config, 401);

    await expect(api.post("/integrations/gmail/sync")).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshSession).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(isExemptFromSignOut("/users/me")).toBe(false);
  });
});
