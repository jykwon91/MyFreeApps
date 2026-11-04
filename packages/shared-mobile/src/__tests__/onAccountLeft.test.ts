import { onAccountLeft } from "../auth/onAccountLeft";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

function setUp() {
  let state: SessionState = { status: "restoring" };
  const listeners = new Set<() => void>();
  const session = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as MobileSession;
  const left = jest.fn();
  onAccountLeft(session, left);
  return {
    left,
    moveTo: (next: SessionState) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const signedIn = (email: string): SessionState => ({ status: "signedIn", email, sessionId: "s" });
const signedOut = (endedByServer: boolean): SessionState => ({ status: "signedOut", endedByServer, lastEmail: null });

describe("onAccountLeft", () => {
  it("fires on signing out", () => {
    const { left, moveTo } = setUp();
    moveTo(signedIn("a"));
    moveTo(signedOut(false));
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("fires when another account signs in over this one", () => {
    const { left, moveTo } = setUp();
    moveTo(signedIn("a"));
    moveTo(signedIn("b"));
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("waits to see who signs in after the server ends a session", () => {
    const { left, moveTo } = setUp();
    moveTo(signedIn("a"));
    moveTo(signedOut(true));
    expect(left).not.toHaveBeenCalled();
    moveTo(signedIn("a"));
    expect(left).not.toHaveBeenCalled();
    moveTo(signedOut(true));
    moveTo(signedIn("b"));
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("stays quiet for someone signing in from signed out", () => {
    const { left, moveTo } = setUp();
    moveTo(signedOut(false));
    moveTo(signedIn("a"));
    expect(left).not.toHaveBeenCalled();
  });
});
