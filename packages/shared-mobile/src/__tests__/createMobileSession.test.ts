import { _resetPlatformForTests, configurePlatform } from "@platform/core/platform/configurePlatform";
import { _resetSessionRefreshForTests } from "@platform/core/lib/session-refresh";
import * as SecureStore from "expo-secure-store";
import { getInstallationTimeAsync } from "expo-application";
import { requestLogin, requestLogout, requestRefresh } from "../auth/mobileAuthApi";
import { createMobileSession } from "../auth/createMobileSession";
import { STORED_SESSION_KEY } from "../constants/session";
import type { MobileSession } from "../types/MobileSession";
import type { MobileTokens } from "../types/MobileTokens";

jest.mock("expo-secure-store");
jest.mock("expo-application", () => ({ getInstallationTimeAsync: jest.fn() }));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("../auth/mobileAuthApi");

const INSTALLED = new Date("2026-01-01T00:00:00.000Z");
const stored = (overrides = {}) =>
  JSON.stringify({
    refreshToken: "r1",
    sessionId: "s1",
    email: "a@example.com",
    installedAt: INSTALLED.toISOString(),
    ...overrides,
  });
const tokens = (n: number): MobileTokens => ({
  access_token: `a${n}`,
  refresh_token: `r${n}`,
  session_id: "s1",
});

const getItem = jest.mocked(SecureStore.getItemAsync);
const setItem = jest.mocked(SecureStore.setItemAsync);
const deleteItem = jest.mocked(SecureStore.deleteItemAsync);
const refresh = jest.mocked(requestRefresh);
const login = jest.mocked(requestLogin);
const logout = jest.mocked(requestLogout);

function newSession(): MobileSession {
  const session = createMobileSession();
  configurePlatform({
    baseURL: "https://api.test",
    tokenStore: session.tokenStore,
    orgStore: { get: () => null },
    isOnLogin: () => false,
    refreshSession: session.refreshSession,
  });
  return session;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.resetAllMocks();
  _resetPlatformForTests();
  _resetSessionRefreshForTests();
  getItem.mockResolvedValue(null);
  setItem.mockResolvedValue();
  deleteItem.mockResolvedValue();
  logout.mockResolvedValue(true);
  jest.mocked(getInstallationTimeAsync).mockResolvedValue(INSTALLED);
});

describe("at launch", () => {
  it("is signed out with nothing stored, and reads as restoring until it knows", async () => {
    const session = newSession();
    expect(session.getState().status).toBe("restoring");
    await session.start();
    expect(session.getState()).toEqual({ status: "signedOut", endedByServer: false, lastEmail: null });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is signed in straight away with a stored session, and gets a token in the background", async () => {
    getItem.mockResolvedValue(stored());
    refresh.mockResolvedValue(tokens(2));
    const session = newSession();

    await session.start();
    expect(session.getState()).toEqual({ status: "signedIn", email: "a@example.com", sessionId: "s1" });

    await settle();
    expect(session.tokenStore.get()).toBe("a2");
    expect(JSON.parse(setItem.mock.calls[0][1])).toMatchObject({ refreshToken: "r2", email: "a@example.com" });
  });

  it("stays signed in when the server doesn't answer", async () => {
    getItem.mockResolvedValue(stored());
    refresh.mockResolvedValue("no_answer");
    const session = newSession();
    await session.start();
    await settle();
    expect(session.getState().status).toBe("signedIn");
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("ends the session when the server refuses it, and says so", async () => {
    getItem.mockResolvedValue(stored());
    refresh.mockResolvedValue("refused");
    const session = newSession();
    await session.start();
    await settle();
    expect(session.getState()).toEqual({ status: "signedOut", endedByServer: true, lastEmail: "a@example.com" });
    expect(deleteItem).toHaveBeenCalledWith(STORED_SESSION_KEY, expect.anything());
  });

  it("keeps what's stored when the phone won't give it up", async () => {
    getItem.mockRejectedValue(new Error("locked"));
    const session = newSession();
    await session.start();

    expect(session.getState()).toEqual({ status: "unreadable" });
    await expect(session.refreshSession()).resolves.toBe("unavailable");
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("reads it once the phone can", async () => {
    getItem.mockRejectedValueOnce(new Error("locked"));
    const session = newSession();
    await session.start();

    getItem.mockResolvedValue(stored());
    refresh.mockResolvedValue(tokens(2));
    await session.retryRestore();
    expect(session.getState().status).toBe("signedIn");
  });

  it("doesn't delete an unreadable session when the user chooses to sign in over it", async () => {
    getItem.mockRejectedValue(new Error("locked"));
    const session = newSession();
    await session.start();
    session.skipRestore();

    await expect(session.refreshSession()).resolves.toBe("signed_out");
    session.tokenStore.clear();

    expect(session.getState()).toEqual({ status: "signedOut", endedByServer: false, lastEmail: null });
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("forgets a session from before a reinstall", async () => {
    getItem.mockResolvedValue(stored({ installedAt: "2025-01-01T00:00:00.000Z" }));
    const session = newSession();
    await session.start();
    await settle();
    expect(session.getState().status).toBe("signedOut");
    expect(refresh).not.toHaveBeenCalled();
    expect(deleteItem).toHaveBeenCalled();
    expect(logout).toHaveBeenCalledWith("r1");
  });

  it("keeps the session if the install date can't be read", async () => {
    getItem.mockResolvedValue(stored());
    refresh.mockResolvedValue("no_answer");
    jest.mocked(getInstallationTimeAsync).mockRejectedValue(new Error("nope"));
    const session = newSession();
    await session.start();
    expect(session.getState().status).toBe("signedIn");
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("ignores stored data it can't make sense of", async () => {
    getItem.mockResolvedValue("not json");
    const session = newSession();
    await session.start();
    expect(session.getState().status).toBe("signedOut");
  });
});

describe("keeping tokens", () => {
  it("never stores the access token", async () => {
    login.mockResolvedValue(tokens(1));
    const session = newSession();
    await session.start();
    await session.signIn({ email: "a@example.com", password: "pw" });

    expect(session.tokenStore.get()).toBe("a1");
    expect(setItem.mock.calls[0][1]).not.toContain("a1\"");
    expect(JSON.parse(setItem.mock.calls[0][1])).not.toHaveProperty("accessToken");
  });

  it("stores it only readable on this device", async () => {
    login.mockResolvedValue(tokens(1));
    const session = newSession();
    await session.start();
    await session.signIn({ email: "a@example.com", password: "pw" });
    expect(setItem.mock.calls[0][2]).toEqual({ keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  });

  it("applies storage changes in the order they were made", async () => {
    const order: string[] = [];
    let finishWrite: () => void = () => {};
    setItem.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = () => {
            order.push("write");
            resolve();
          };
        }),
    );
    deleteItem.mockImplementation(async () => {
      order.push("delete");
    });
    login.mockResolvedValue(tokens(1));
    getItem.mockResolvedValue(stored());
    refresh.mockResolvedValue(tokens(2));
    const session = newSession();
    await session.start();
    await settle();

    const signingOut = session.signOut();
    finishWrite();
    await signingOut;
    await settle();
    expect(order).toEqual(["write", "delete"]);
  });
});

describe("signing in", () => {
  it("asks for a code and stays signed out", async () => {
    login.mockResolvedValue("totp_required");
    const session = newSession();
    await session.start();
    await expect(session.signIn({ email: "a@example.com", password: "pw" })).resolves.toEqual({
      outcome: "totpRequired",
    });
    expect(session.getState().status).toBe("signedOut");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("reports a failure", async () => {
    login.mockResolvedValue("bad_credentials");
    const session = newSession();
    await session.start();
    await expect(session.signIn({ email: "a@example.com", password: "x" })).resolves.toEqual({
      outcome: "failed",
      failure: "bad_credentials",
    });
  });

  it("names the phone to the server", async () => {
    login.mockResolvedValue(tokens(1));
    const session = newSession();
    await session.start();
    await session.signIn({ email: "a@example.com", password: "pw" });
    expect(login).toHaveBeenCalledWith(expect.anything(), "Test Phone");
  });

  it("sends one request for two presses", async () => {
    login.mockResolvedValue("totp_required");
    const session = newSession();
    await session.start();
    await Promise.all([
      session.signIn({ email: "a@example.com", password: "pw", totpCode: "123456" }),
      session.signIn({ email: "a@example.com", password: "pw", totpCode: "123456" }),
    ]);
    expect(login).toHaveBeenCalledTimes(1);
  });

  it("ends the session it replaces", async () => {
    getItem.mockResolvedValue(stored());
    refresh.mockResolvedValue("no_answer");
    login.mockResolvedValue({ ...tokens(5), session_id: "s5" });
    const session = newSession();
    await session.start();
    await settle();

    await session.signIn({ email: "b@example.com", password: "pw" });

    expect(session.getState()).toEqual({ status: "signedIn", email: "b@example.com", sessionId: "s5" });
    expect(logout).toHaveBeenCalledWith("r1");
  });

  it("isn't overwritten by the old session's refresh", async () => {
    getItem.mockResolvedValue(stored());
    let answer: (value: MobileTokens) => void = () => {};
    refresh.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    login.mockResolvedValue({ ...tokens(5), session_id: "s5" });
    const session = newSession();
    await session.start();
    await settle();

    await session.signIn({ email: "b@example.com", password: "pw" });
    answer(tokens(2));
    await settle();

    expect(session.getState()).toEqual({ status: "signedIn", email: "b@example.com", sessionId: "s5" });
    expect(session.tokenStore.get()).toBe("a5");
    expect(JSON.parse(setItem.mock.lastCall?.[1] ?? "{}")).toMatchObject({ refreshToken: "r5" });
    expect(logout).toHaveBeenCalledWith("r2");
  });

  it("uses the new session for a refresh that starts while it's being saved", async () => {
    getItem.mockResolvedValue(stored());
    refresh.mockResolvedValueOnce("no_answer");
    login.mockResolvedValue({ ...tokens(5), session_id: "s5" });
    const session = newSession();
    await session.start();
    await settle();
    let finishWrite: () => void = () => {};
    setItem.mockReturnValueOnce(new Promise<void>((resolve) => (finishWrite = resolve)));

    const signingIn = session.signIn({ email: "b@example.com", password: "pw" });
    await settle();
    refresh.mockResolvedValueOnce(tokens(6));
    const refreshing = session.refreshSession();
    await settle();
    finishWrite();
    await Promise.all([signingIn, refreshing]);

    expect(refresh).toHaveBeenLastCalledWith("r5");
    expect(session.getState()).toMatchObject({ status: "signedIn", email: "b@example.com" });
    expect(JSON.parse(setItem.mock.lastCall?.[1] ?? "{}")).toMatchObject({ refreshToken: "r6" });
  });

  it("is signed out, not half signed in, when replacing a session can't be saved", async () => {
    getItem.mockResolvedValue(stored());
    refresh.mockResolvedValue("no_answer");
    login.mockResolvedValue({ ...tokens(5), session_id: "s5" });
    setItem.mockRejectedValueOnce(new Error("keychain"));
    const session = newSession();
    await session.start();
    await settle();

    const result = await session.signIn({ email: "b@example.com", password: "pw" });

    expect(result).toEqual({ outcome: "failed", failure: "storage" });
    expect(session.getState().status).toBe("signedOut");
    expect(session.tokenStore.get()).toBeNull();
    expect(logout).toHaveBeenCalledWith("r5");
    expect(logout).toHaveBeenCalledWith("r1");
  });

  it("doesn't let an earlier sign-out cover a newer sign-in", async () => {
    getItem.mockResolvedValue(stored());
    refresh.mockResolvedValue("no_answer");
    login.mockResolvedValue({ ...tokens(5), session_id: "s5" });
    let finishLogout: (value: boolean) => void = () => {};
    logout.mockReturnValueOnce(new Promise((resolve) => (finishLogout = resolve)));
    const session = newSession();
    await session.start();
    await settle();

    const signingOut = session.signOut();
    await session.signIn({ email: "b@example.com", password: "pw" });
    finishLogout(true);
    await signingOut;

    expect(session.getState()).toMatchObject({ status: "signedIn", email: "b@example.com" });
  });

  it("fails visibly and ends the new session when the phone can't keep it", async () => {
    login.mockResolvedValue(tokens(1));
    setItem.mockRejectedValue(new Error("full"));
    const session = newSession();
    await session.start();

    await expect(session.signIn({ email: "a@example.com", password: "pw" })).resolves.toEqual({
      outcome: "failed",
      failure: "storage",
    });
    expect(session.getState().status).toBe("signedOut");
    expect(session.tokenStore.get()).toBeNull();
    expect(logout).toHaveBeenCalledWith("r1");
  });
});

describe("signing out", () => {
  async function signedIn(): Promise<MobileSession> {
    login.mockResolvedValue(tokens(1));
    const session = newSession();
    await session.start();
    await session.signIn({ email: "a@example.com", password: "pw" });
    return session;
  }

  it("clears this phone and tells the server", async () => {
    const session = await signedIn();
    await expect(session.signOut()).resolves.toEqual({ serverReached: true });
    expect(logout).toHaveBeenCalledWith("r1");
    expect(session.tokenStore.get()).toBeNull();
    expect(deleteItem).toHaveBeenCalled();
    expect(session.getState()).toEqual({ status: "signedOut", endedByServer: false, lastEmail: "a@example.com" });
  });

  it("still clears this phone when the server can't be reached", async () => {
    const session = await signedIn();
    logout.mockResolvedValue(false);
    await expect(session.signOut()).resolves.toEqual({ serverReached: false });
    expect(session.getState().status).toBe("signedOut");
    expect(deleteItem).toHaveBeenCalled();
  });

  it("isn't undone by a refresh that was already on its way", async () => {
    const session = await signedIn();
    let answer: (value: MobileTokens) => void = () => {};
    refresh.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const refreshing = session.refreshSession();
    await settle();

    await session.signOut();
    answer(tokens(2));
    await refreshing;

    expect(session.tokenStore.get()).toBeNull();
    expect(session.getState().status).toBe("signedOut");
    expect(logout).toHaveBeenCalledWith("r2");
  });

  it("drops the refresh token when the server demands a new sign-in", async () => {
    const session = await signedIn();
    session.tokenStore.clear();
    await expect(session.refreshSession()).resolves.toBe("signed_out");
    expect(refresh).not.toHaveBeenCalled();
    expect(session.getState()).toEqual({ status: "signedOut", endedByServer: true, lastEmail: "a@example.com" });
  });

  it("clears the notice when dismissed, keeping the email", async () => {
    const session = await signedIn();
    session.tokenStore.clear();
    session.dismissEndedNotice();
    expect(session.getState()).toEqual({ status: "signedOut", endedByServer: false, lastEmail: "a@example.com" });
  });
});
