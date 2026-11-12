import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyAuthChange } from "../lib/auth-store";
import { renewAfterUnauthorized } from "../lib/renewAfterUnauthorized";
import { _resetSessionRefreshForTests } from "../lib/session-refresh";
import { _resetPlatformForTests, configurePlatform } from "../platform/configurePlatform";
import type { SessionRefreshResult } from "../platform/types/SessionRefreshResult";

vi.mock("../lib/auth-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/auth-store")>()),
  notifyAuthChange: vi.fn(),
}));

/** A phone signed in as `account` with `token`, whose refresh gives `next` (or fails with `result`). */
function setUp({ token, result = "refreshed", next = "new", account = "me" }: {
  token: string | null;
  result?: SessionRefreshResult;
  next?: string;
  account?: string;
}) {
  const state = { token, account };
  const refresh = vi.fn(async () => {
    if (result === "refreshed") state.token = next;
    return result;
  });
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: {
      get: () => state.token,
      set: (value) => {
        state.token = value;
      },
      clear: () => {
        state.token = null;
      },
    },
    orgStore: { get: () => null },
    isOnLogin: () => false,
    refreshSession: refresh,
    currentAccount: () => state.account,
  });
  return { state, refresh };
}

beforeEach(() => {
  vi.mocked(notifyAuthChange).mockClear();
  _resetSessionRefreshForTests();
});

afterEach(() => {
  vi.useRealTimers();
  _resetPlatformForTests();
});

describe("renewAfterUnauthorized", () => {
  it("refreshes a refused token, and says the request can go again", async () => {
    const { refresh } = setUp({ token: "old" });
    expect(await renewAfterUnauthorized({ token: "old", account: "me" })).toBe("renewed");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("doesn't refresh again for a request sent before the last refresh", async () => {
    const { refresh } = setUp({ token: "new" });
    expect(await renewAfterUnauthorized({ token: "old", account: "me" })).toBe("renewed");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says the sign-in is over when the refresh signs out, and signs out once", async () => {
    const { state } = setUp({ token: "old", result: "signed_out" });
    expect(await renewAfterUnauthorized({ token: "old", account: "me" })).toBe("ended");
    expect(state.token).toBeNull();
    expect(notifyAuthChange).toHaveBeenCalledTimes(1);
  });

  it("says the server can't be reached when the refresh can't, then waits before asking again", async () => {
    const { refresh } = setUp({ token: "old", result: "unavailable" });
    expect(await renewAfterUnauthorized({ token: "old", account: "me" })).toBe("unreachable");
    expect(await renewAfterUnauthorized({ token: "old", account: "me" })).toBe("unreachable");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("never sends a request again as someone who signed in since", async () => {
    const { state } = setUp({ token: "theirs" });
    state.account = "someone-else";
    expect(await renewAfterUnauthorized({ token: "old", account: "me" })).toBe("ended");
  });
});
