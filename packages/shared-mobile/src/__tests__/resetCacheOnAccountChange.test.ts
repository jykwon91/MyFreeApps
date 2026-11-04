import { resetCacheOnAccountChange } from "../auth/resetCacheOnAccountChange";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

function setUp(initial: SessionState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const session = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as MobileSession;
  const resetCache = jest.fn();
  resetCacheOnAccountChange(session, resetCache);
  return {
    resetCache,
    moveTo: (next: SessionState) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const signedIn = (email: string, sessionId = "s"): SessionState => ({ status: "signedIn", email, sessionId });
const SIGNED_OUT: SessionState = { status: "signedOut", endedByServer: false, lastEmail: null };

describe("resetCacheOnAccountChange", () => {
  it.each<[string, SessionState, SessionState]>([
    ["signing out", signedIn("a"), SIGNED_OUT],
    ["signing in", SIGNED_OUT, signedIn("a")],
    ["another account signing in", signedIn("a"), signedIn("b")],
    ["no longer being able to read the account", signedIn("a"), { status: "unreadable" }],
  ])("resets on %s", (_name, from, to) => {
    const { moveTo, resetCache } = setUp(from);
    moveTo(to);
    expect(resetCache).toHaveBeenCalledTimes(1);
  });

  it.each<[string, SessionState, SessionState]>([
    ["finding out who it is at launch", { status: "restoring" }, signedIn("a")],
    ["finding nobody at launch", { status: "restoring" }, SIGNED_OUT],
    ["a refresh changing the session id", signedIn("a", "s1"), signedIn("a", "s2")],
  ])("keeps the cache on %s", (_name, from, to) => {
    const { moveTo, resetCache } = setUp(from);
    moveTo(to);
    expect(resetCache).not.toHaveBeenCalled();
  });
});
