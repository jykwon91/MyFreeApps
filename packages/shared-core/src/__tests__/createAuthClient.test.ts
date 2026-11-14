import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthClient } from "../auth/createAuthClient";
import api from "../lib/api";
import { onIdentityChange } from "../lib/auth-store";
import { _resetPlatformForTests, configurePlatform } from "../platform/configurePlatform";
import { baseApi } from "../store/baseApi";

const RESET_ACTION = baseApi.util.resetApiState();

const dispatch = vi.fn();
let token: string | null = null;
const setToken = vi.fn((next: string) => {
  token = next;
});
const clearToken = vi.fn(() => {
  token = null;
});
const post = vi.spyOn(api, "post");

const client = createAuthClient({ dispatch });
// Registered after the client's own reset, so it sees what a subscriber would.
const identityChanged = vi.fn();
const stopObserving = onIdentityChange(identityChanged);

afterAll(() => {
  stopObserving();
  client.dispose();
});

function respondWith(data: unknown): void {
  post.mockResolvedValueOnce({ data });
}

beforeEach(() => {
  vi.clearAllMocks();
  post.mockReset();
  token = null;
  _resetPlatformForTests();
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: { get: () => token, set: setToken, clear: clearToken },
    orgStore: { get: () => null },
    isOnLogin: () => false,
  });
});

describe("signIn", () => {
  it("posts the credentials to the TOTP login endpoint", async () => {
    respondWith({ access_token: "jwt" });
    await client.signIn("u@e.com", "pw", "123456");
    expect(post).toHaveBeenCalledWith("/auth/totp/login", {
      email: "u@e.com",
      password: "pw",
      totp_code: "123456",
    });
  });

  it("writes the token through the injected store, then resets the cache", async () => {
    respondWith({ access_token: "jwt" });

    await expect(client.signIn("u@e.com", "pw")).resolves.toEqual({ status: "ok" });

    expect(setToken).toHaveBeenCalledWith("jwt");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(RESET_ACTION);
    expect(setToken.mock.invocationCallOrder[0]).toBeLessThan(dispatch.mock.invocationCallOrder[0]);
  });

  it("reports a TOTP challenge without touching the token, the cache or subscribers", async () => {
    respondWith({ detail: "totp_required" });

    await expect(client.signIn("u@e.com", "pw")).resolves.toEqual({ status: "totp_required" });

    expect(setToken).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(identityChanged).not.toHaveBeenCalled();
  });

  it("rejects a response with neither a token nor a challenge", async () => {
    respondWith({});
    await expect(client.signIn("u@e.com", "pw")).rejects.toThrow(
      "Login response did not contain a token or TOTP challenge.",
    );
    expect(setToken).not.toHaveBeenCalled();
  });

  it("rejects, leaving the cache and subscribers alone, when the store can't keep the token", async () => {
    respondWith({ access_token: "jwt" });
    setToken.mockImplementationOnce(() => {
      throw new Error("storage blocked");
    });

    await expect(client.signIn("u@e.com", "pw")).rejects.toThrow("storage blocked");

    expect(dispatch).not.toHaveBeenCalled();
    expect(identityChanged).not.toHaveBeenCalled();
  });

  it("leaves the token alone when the request fails", async () => {
    post.mockRejectedValueOnce(new Error("Network Error"));
    await expect(client.signIn("u@e.com", "pw")).rejects.toThrow("Network Error");
    expect(setToken).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("clears the token through the injected store, then resets the cache", async () => {
    respondWith({ access_token: "jwt" });
    await client.signIn("u@e.com", "pw");
    dispatch.mockClear();

    client.signOut();

    expect(clearToken).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(RESET_ACTION);
    expect(clearToken.mock.invocationCallOrder[0]).toBeLessThan(dispatch.mock.invocationCallOrder[0]);
  });
});

// Two sign-up request shapes exist on purpose. One app's form asks for a display
// name and sends null when it's blank; another's never sends the field at all.
describe("register", () => {
  it("sends only the credentials, and doesn't sign in", async () => {
    respondWith({ id: "1" });
    await client.register("u@e.com", "pw");
    expect(post).toHaveBeenCalledWith(
      "/auth/register",
      { email: "u@e.com", password: "pw" },
      { headers: {} },
    );
    expect(setToken).not.toHaveBeenCalled();
    expect(identityChanged).not.toHaveBeenCalled();
  });

  it("forwards a Turnstile token as a header", async () => {
    respondWith({ id: "1" });
    await client.register("u@e.com", "pw", "ts");
    expect(post).toHaveBeenCalledWith(
      "/auth/register",
      { email: "u@e.com", password: "pw" },
      { headers: { "X-Turnstile-Token": "ts" } },
    );
  });
});

describe("registerWithDisplayName", () => {
  it("trims the display name", async () => {
    respondWith({ id: "1" });
    await client.registerWithDisplayName("u@e.com", "pw", "  Ada  ", "ts");
    expect(post).toHaveBeenCalledWith(
      "/auth/register",
      { email: "u@e.com", password: "pw", display_name: "Ada" },
      { headers: { "X-Turnstile-Token": "ts" } },
    );
  });

  it.each([[undefined], [""], ["   "]])("sends a blank string, which the backend requires, for a display name of %j", async (name) => {
    respondWith({ id: "1" });
    await client.registerWithDisplayName("u@e.com", "pw", name);
    expect(post).toHaveBeenCalledWith(
      "/auth/register",
      { email: "u@e.com", password: "pw", display_name: "" },
      { headers: {} },
    );
    expect(setToken).not.toHaveBeenCalled();
  });
});

describe("the account recovery calls", () => {
  it("requestVerifyToken posts the email", async () => {
    respondWith(null);
    await client.requestVerifyToken("u@e.com");
    expect(post).toHaveBeenCalledWith(
      "/auth/request-verify-token",
      { email: "u@e.com" },
      { timeout: undefined },
    );
  });

  it("forgotPassword sends no Turnstile header without a token", async () => {
    respondWith(null);
    await client.forgotPassword("u@e.com");
    expect(post).toHaveBeenCalledWith(
      "/auth/forgot-password",
      { email: "u@e.com" },
      { headers: {} },
    );
  });

  it("forgotPassword forwards a Turnstile token as a header", async () => {
    respondWith(null);
    await client.forgotPassword("u@e.com", "ts");
    expect(post).toHaveBeenCalledWith(
      "/auth/forgot-password",
      { email: "u@e.com" },
      { headers: { "X-Turnstile-Token": "ts" } },
    );
  });

  it("resetPassword posts the emailed token and the new password", async () => {
    respondWith(null);
    await client.resetPassword("emailed", "new-pw");
    expect(post).toHaveBeenCalledWith("/auth/reset-password", {
      token: "emailed",
      password: "new-pw",
    });
  });
});
