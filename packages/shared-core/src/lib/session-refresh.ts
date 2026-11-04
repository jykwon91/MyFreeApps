import { REFRESH_COOLDOWN_MS } from "../constants/sessionRefresh";
import { getPlatform } from "../platform/configurePlatform";
import type { SessionRefreshResult } from "../platform/types/SessionRefreshResult";
import { notifyAuthChange } from "./auth-store";

let inFlight: Promise<SessionRefreshResult> | null = null;
let lastUnavailableAt: number | null = null;

async function runRefresh(refreshSession: () => Promise<SessionRefreshResult>): Promise<SessionRefreshResult> {
  const { tokenStore } = getPlatform();
  const tokenBefore = tokenStore.get();
  let result: SessionRefreshResult;
  try {
    result = await refreshSession();
  } catch {
    result = "unavailable";
  }
  lastUnavailableAt = result === "unavailable" ? Date.now() : null;
  if (result !== "signed_out") return result;

  // Signing in again while this ran replaced the session that was refused.
  if (tokenStore.get() !== tokenBefore) return "refreshed";
  tokenStore.clear();
  notifyAuthChange();
  return result;
}

/**
 * The only way to refresh. Two refreshes at once would present one refresh token
 * twice, which the server can treat as theft, so launch and foreground code must call
 * this too rather than `refreshSession` directly.
 */
export function refreshSessionOnce(): Promise<SessionRefreshResult> {
  const { refreshSession } = getPlatform();
  if (!refreshSession) return Promise.resolve("unavailable");
  inFlight ??= runRefresh(refreshSession).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** A rejected request waits this out, so a limited or absent server isn't asked repeatedly. */
export function isRefreshCoolingDown(): boolean {
  return (
    inFlight === null &&
    lastUnavailableAt !== null &&
    Date.now() - lastUnavailableAt < REFRESH_COOLDOWN_MS
  );
}

export function _resetSessionRefreshForTests(): void {
  inFlight = null;
  lastUnavailableAt = null;
}
