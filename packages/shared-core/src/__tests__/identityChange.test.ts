/**
 * Cached API state belongs to one user. However the token changes hands (a sign-in
 * or sign-out, a rejected token, step-up reauth, a refused refresh), the cache resets
 * before anything re-renders. A refresh for the same user, or a step-up TOTP check,
 * leaves it alone.
 */
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthClient } from "../auth/createAuthClient";
import { StepUpReauthRequiredError } from "../auth/errors/StepUpReauthRequiredError";
import { _resetForTests as _resetStepUpForTests, getState as getStepUpState, submitCode } from "../auth/stepUpController";
import api from "../lib/api";
import { notifyAuthChange, onAccountLeft, onIdentityChange } from "../lib/auth-store";
import { _resetSessionRefreshForTests } from "../lib/session-refresh";
import { _resetPlatformForTests, configurePlatform } from "../platform/configurePlatform";
import type { SessionRefreshResult } from "../platform/types/SessionRefreshResult";
import { baseApi } from "../store/baseApi";

const RESET_ACTION = baseApi.util.resetApiState();
const originalAdapter = api.defaults.adapter;

const dispatch = vi.fn();
const client = createAuthClient({ dispatch });

let token: string | null = null;

function jwtFor(sub: string, issuedAt: number): string {
  const payload = btoa(JSON.stringify({ sub, iat: issuedAt, exp: issuedAt + 3600 }));
  return `header.${payload}.signature`;
}

function respond(config: InternalAxiosRequestConfig, status: number, headers: Record<string, string> = {}): ReturnType<AxiosAdapter> {
  const response = { data: {}, status, statusText: "", headers, config };
  if (status < 400) return Promise.resolve(response);
  return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
}

/** Answers each request with the next status in `replies`, then repeats the last. */
function serverReplying(replies: readonly (readonly [number, Record<string, string>?])[]): void {
  let i = 0;
  api.defaults.adapter = (config) => {
    const [status, headers] = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return respond(config, status, headers);
  };
}

function configure(refreshSession?: () => Promise<SessionRefreshResult>): void {
  _resetPlatformForTests();
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: {
      get: () => token,
      set: (next) => {
        token = next;
      },
      clear: () => {
        token = null;
      },
    },
    orgStore: { get: () => null },
    isOnLogin: () => false,
    refreshSession,
  });
}

/** How many times the API cache was reset. The auth client dispatches nothing else. */
function resets(): number {
  dispatch.mock.calls.forEach(([action]) => expect(action).toEqual(RESET_ACTION));
  return dispatch.mock.calls.length;
}

beforeEach(() => {
  token = jwtFor("user-a", 1_000);
  dispatch.mockClear();
  _resetStepUpForTests();
  _resetSessionRefreshForTests();
  configure();
});

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  _resetStepUpForTests();
});

afterAll(() => {
  client.dispose();
});

describe("notifyAuthChange", () => {
  it("resets when the token now belongs to a different user", () => {
    token = jwtFor("user-b", 2_000);
    notifyAuthChange();
    expect(resets()).toBe(1);
  });

  it("resets when the token is gone", () => {
    token = null;
    notifyAuthChange();
    expect(resets()).toBe(1);
  });

  it("leaves the cache alone for a new token for the same user", () => {
    token = jwtFor("user-a", 2_000);
    notifyAuthChange();
    expect(resets()).toBe(0);
  });

  it("resets once per change, not on every notification", () => {
    token = null;
    notifyAuthChange();
    notifyAuthChange();
    expect(resets()).toBe(1);
  });

  it("treats a token naming no user as someone else", () => {
    token = "opaque-token";
    notifyAuthChange();
    expect(resets()).toBe(1);
  });

  it("runs every listener when one throws, then rethrows its error", () => {
    const failure = new Error("listener failed");
    const stopFailing = onIdentityChange(() => {
      throw failure;
    });
    const after = vi.fn();
    const stopAfter = onIdentityChange(after);
    token = null;

    expect(() => notifyAuthChange()).toThrow(failure);

    stopFailing();
    stopAfter();
    expect(resets()).toBe(1);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("stops calling a listener once it unsubscribes", () => {
    const listener = vi.fn();
    const stop = onIdentityChange(listener);
    stop();
    token = null;
    notifyAuthChange();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("onAccountLeft", () => {
  const left = vi.fn();
  let stop: () => void = () => undefined;

  beforeEach(() => {
    left.mockClear();
    stop = onAccountLeft(left);
  });

  afterEach(() => {
    stop();
  });

  it("runs on a sign-out", () => {
    client.signOut();
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("runs when a different user signs in", () => {
    token = jwtFor("user-b", 2_000);
    notifyAuthChange();
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("waits through a session that ended without a sign-out, and stays quiet when the same user comes back", () => {
    token = null;
    notifyAuthChange();
    token = jwtFor("user-a", 2_000);
    notifyAuthChange();
    expect(left).not.toHaveBeenCalled();
  });

  it("runs when a different user signs in after a session that ended", () => {
    token = null;
    notifyAuthChange();
    token = jwtFor("user-b", 2_000);
    notifyAuthChange();
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("runs on a sign-out after a session that ended, once", () => {
    token = null;
    notifyAuthChange();
    client.signOut();
    client.signOut();
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("stays quiet for a refreshed token for the same user", () => {
    token = jwtFor("user-a", 2_000);
    notifyAuthChange();
    expect(left).not.toHaveBeenCalled();
  });

  it("waits through a 401 that ends the session", async () => {
    serverReplying([[401]]);
    await expect(api.get("/things")).rejects.toBeDefined();
    expect(token).toBeNull();
    expect(left).not.toHaveBeenCalled();
  });

  it("stops calling a listener once it unsubscribes", () => {
    stop();
    client.signOut();
    expect(left).not.toHaveBeenCalled();
  });
});

describe("a 401 that signs out", () => {
  it("resets the API state", async () => {
    serverReplying([[401]]);
    await expect(api.get("/things")).rejects.toBeDefined();
    expect(token).toBeNull();
    expect(resets()).toBe(1);
  });

  it("leaves the next user signed in when it answers a request sent with the previous user's token", async () => {
    const userB = jwtFor("user-b", 2_000);
    api.defaults.adapter = (config) => {
      // User B signs in while user A's request is still in flight.
      token = userB;
      notifyAuthChange();
      return respond(config, 401);
    };

    await expect(api.get("/things")).rejects.toBeDefined();

    expect(token).toBe(userB);
    expect(resets()).toBe(1);
  });
});

describe("dispose", () => {
  it("stops the client resetting the cache", () => {
    const disposedDispatch = vi.fn();
    const disposed = createAuthClient({ dispatch: disposedDispatch });
    disposed.dispose();
    token = null;
    notifyAuthChange();
    expect(disposedDispatch).not.toHaveBeenCalled();
    expect(resets()).toBe(1);
  });
});

describe("session refresh", () => {
  it("leaves the cache alone when a rejected token is refreshed for the same user", async () => {
    configure(async () => {
      token = jwtFor("user-a", 2_000);
      return "refreshed";
    });
    serverReplying([[401], [200]]);
    await expect(api.get("/things")).resolves.toMatchObject({ status: 200 });
    expect(token).toBe(jwtFor("user-a", 2_000));
    expect(resets()).toBe(0);
  });

  it("resets when the server refuses the refresh and the session ends", async () => {
    configure(async () => "signed_out");
    serverReplying([[401]]);
    await expect(api.get("/things")).rejects.toBeDefined();
    expect(token).toBeNull();
    expect(resets()).toBe(1);
  });
});

describe("step-up", () => {
  it("keeps the cache through a TOTP check: the user hasn't changed", async () => {
    serverReplying([[401, { "x-require-step-up": "totp" }], [200]]);
    const request = api.get("/admin/thing");
    await vi.waitFor(() => expect(getStepUpState().pending).not.toBeNull());
    submitCode("123456");
    await expect(request).resolves.toMatchObject({ status: 200 });
    expect(token).toBe(jwtFor("user-a", 1_000));
    expect(resets()).toBe(0);
  });

  it("resets on reauth, which clears the token, as a sign-out does", async () => {
    serverReplying([[401, { "x-require-step-up": "reauth" }]]);
    await expect(api.get("/admin/thing")).rejects.toBeInstanceOf(StepUpReauthRequiredError);
    expect(token).toBeNull();
    expect(resets()).toBe(1);
  });
});
