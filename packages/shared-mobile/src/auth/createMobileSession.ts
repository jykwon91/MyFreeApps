import { refreshSessionOnce } from "@platform/core/lib/session-refresh";
import type { SessionRefreshResult } from "@platform/core";
import * as Device from "expo-device";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";
import type { SignInCredentials } from "../types/SignInCredentials";
import type { SignInResult } from "../types/SignInResult";
import type { StoredSession } from "../types/StoredSession";
import { requestLogin, requestLogout, requestRefresh } from "./mobileAuthApi";
import {
  currentInstallStamp,
  deleteStoredSession,
  readStoredSession,
  writeStoredSession,
} from "./sessionStorage";

/**
 * The access token stays in memory. The refresh token stays in the phone's secure
 * storage, and only a refusal from the server or the user's own sign-out removes it: a
 * locked phone or a failed read leaves it in place.
 */
export function createMobileSession(): MobileSession {
  let state: SessionState = { status: "restoring" };
  let accessToken: string | null = null;
  let stored: StoredSession | null = null;
  // Moves on whenever the session is replaced or ended, so a slower request can't undo it.
  let generation = 0;
  let restoring: Promise<void> | null = null;
  let pendingWrites: Promise<unknown> = Promise.resolve();
  let signingIn: Promise<SignInResult> | null = null;
  const listeners = new Set<() => void>();

  function setState(next: SessionState): void {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function lastEmail(): string | null {
    if (state.status === "signedIn") return state.email;
    return state.status === "signedOut" ? state.lastEmail : null;
  }

  // Secure storage calls are asynchronous, and must land in the order they were made.
  function enqueueWrite(write: () => Promise<void>): Promise<void> {
    const result = pendingWrites.then(write);
    pendingWrites = result.catch(() => {});
    return result;
  }

  function forgetStoredSession(): void {
    enqueueWrite(deleteStoredSession).catch((error: unknown) => {
      console.warn("Couldn't delete the stored session", error);
    });
  }

  async function restore(): Promise<void> {
    const generationAtStart = generation;
    let found: StoredSession | null;
    try {
      found = await readStoredSession();
    } catch {
      if (generation === generationAtStart) setState({ status: "unreadable" });
      return;
    }
    const installedAt = await currentInstallStamp();
    if (generation !== generationAtStart) return;

    if (found && found.installedAt && installedAt && found.installedAt !== installedAt) {
      // iOS keeps secure items after an uninstall, but deleting the app means signing out.
      void requestLogout(found.refreshToken);
      forgetStoredSession();
      found = null;
    }
    if (!found) {
      setState({ status: "signedOut", endedByServer: false, lastEmail: null });
      return;
    }
    stored = found;
    setState({ status: "signedIn", email: found.email, sessionId: found.sessionId });
    void refreshSessionOnce();
  }

  function start(): Promise<void> {
    restoring ??= restore();
    return restoring;
  }

  async function refreshSession(): Promise<SessionRefreshResult> {
    await start();
    if (state.status === "unreadable") return "unavailable";
    const current = stored;
    if (!current) return "signed_out";

    const generationAtStart = generation;
    const result = await requestRefresh(current.refreshToken);
    if (result === "refused") return generation === generationAtStart ? "signed_out" : "unavailable";
    if (result === "no_answer") return "unavailable";
    if (generation !== generationAtStart) {
      // The session ended while this was on its way, so the new tokens aren't wanted.
      void requestLogout(result.refresh_token);
      return "unavailable";
    }

    const next: StoredSession = { ...current, refreshToken: result.refresh_token, sessionId: result.session_id };
    accessToken = result.access_token;
    stored = next;
    // If this fails the phone still holds the previous token, which the server accepts
    // as a lost response for a day.
    await enqueueWrite(() => writeStoredSession(next)).catch((error: unknown) => {
      console.warn("Couldn't store the new session", error);
    });
    if (generation !== generationAtStart) return "unavailable";
    setState({ status: "signedIn", email: current.email, sessionId: result.session_id });
    return "refreshed";
  }

  function endSession(): void {
    const wasSignedIn = stored !== null;
    const email = lastEmail();
    generation += 1;
    accessToken = null;
    stored = null;
    // With nothing read there's nothing to forget, and what's stored may yet be readable.
    if (wasSignedIn) forgetStoredSession();
    if (wasSignedIn || state.status !== "signedOut") {
      setState({ status: "signedOut", endedByServer: wasSignedIn, lastEmail: email });
    }
  }

  async function completeSignIn(credentials: SignInCredentials): Promise<SignInResult> {
    const result = await requestLogin(credentials, Device.deviceName ?? Device.modelName);
    if (result === "totp_required") return { outcome: "totpRequired" };
    if (typeof result === "string") return { outcome: "failed", failure: result };

    const next: StoredSession = {
      refreshToken: result.refresh_token,
      sessionId: result.session_id,
      email: credentials.email,
      installedAt: await currentInstallStamp(),
    };
    const replaced = stored;
    // All at once, before the write: a refresh starting during it must use the new session,
    // and one already running must not bring the old one back.
    generation += 1;
    accessToken = result.access_token;
    stored = next;
    if (replaced) void requestLogout(replaced.refreshToken);
    try {
      await enqueueWrite(() => writeStoredSession(next));
    } catch {
      // Carrying on would look signed in, then read as signed out on the next launch.
      generation += 1;
      accessToken = null;
      stored = null;
      void requestLogout(result.refresh_token);
      if (replaced) {
        forgetStoredSession();
        setState({ status: "signedOut", endedByServer: false, lastEmail: replaced.email });
      }
      return { outcome: "failed", failure: "storage" };
    }
    setState({ status: "signedIn", email: next.email, sessionId: next.sessionId });
    return { outcome: "signedIn" };
  }

  // A second press would open a second session, and spend a single-use code twice.
  function signIn(credentials: SignInCredentials): Promise<SignInResult> {
    signingIn ??= completeSignIn(credentials).finally(() => {
      signingIn = null;
    });
    return signingIn;
  }

  async function signOut(): Promise<{ serverReached: boolean }> {
    const current = stored;
    const email = lastEmail();
    generation += 1;
    const generationAtSignOut = generation;
    accessToken = null;
    stored = null;
    if (current) forgetStoredSession();
    const serverReached = current ? await requestLogout(current.refreshToken) : true;
    // Signing in while the server was being told is newer than this.
    if (generation === generationAtSignOut) {
      setState({ status: "signedOut", endedByServer: false, lastEmail: email });
    }
    return { serverReached };
  }

  return {
    tokenStore: {
      get: () => accessToken,
      set: (token) => {
        accessToken = token;
      },
      clear: endSession,
    },
    refreshSession,
    currentAccount: () => stored?.email ?? null,
    start,
    retryRestore: () => {
      restoring = restore();
      return restoring;
    },
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    signIn,
    signOut,
    accountDeleted: (certainty) => {
      const wasStored = stored !== null;
      generation += 1;
      accessToken = null;
      stored = null;
      if (wasStored) forgetStoredSession();
      setState({ status: "signedOut", endedByServer: false, lastEmail: null, accountDeleted: certainty });
    },
    skipRestore: () => {
      generation += 1;
      setState({ status: "signedOut", endedByServer: false, lastEmail: null });
    },
    dismissEndedNotice: () => {
      if (state.status === "signedOut") setState({ ...state, endedByServer: false, accountDeleted: undefined });
    },
  };
}
