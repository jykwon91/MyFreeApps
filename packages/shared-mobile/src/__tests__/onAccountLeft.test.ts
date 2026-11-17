import { LEFTOVERS_OWNER_KEY } from "../constants/session";
import { storedItems } from "../../test-support/memorySecureStore";
import { onAccountLeft } from "../auth/onAccountLeft";
import type { MobileSession } from "../types/MobileSession";
import type { SessionState } from "../types/SessionState";

jest.mock("expo-secure-store", () => jest.requireActual("../../test-support/memorySecureStore"));

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => storedItems.clear());

/** A fresh app launch: the phone's storage is whatever the last one left in it. */
async function setUp(options: { settle: boolean } = { settle: true }) {
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
  if (options.settle) await settle();
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
  it("fires on signing out", async () => {
    const { left, moveTo } = await setUp();
    moveTo(signedIn("a"));
    moveTo(signedOut(false));
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("fires when another account signs in over this one", async () => {
    const { left, moveTo } = await setUp();
    moveTo(signedIn("a"));
    moveTo(signedIn("b"));
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("waits to see who signs in after the server ends a session", async () => {
    const { left, moveTo } = await setUp();
    moveTo(signedIn("a"));
    moveTo(signedOut(true));
    expect(left).not.toHaveBeenCalled();
    moveTo(signedIn("a"));
    expect(left).not.toHaveBeenCalled();
    moveTo(signedOut(true));
    moveTo(signedIn("b"));
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("fires when a session the server ended turns out to be a deleted account", async () => {
    const { left, moveTo } = await setUp();
    moveTo(signedIn("a"));
    moveTo(signedOut(true));
    moveTo({ status: "signedOut", endedByServer: false, lastEmail: null, accountDeleted: "unconfirmed" });
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("stays quiet for someone signing in from signed out", async () => {
    const { left, moveTo } = await setUp();
    moveTo(signedOut(false));
    moveTo(signedIn("a"));
    expect(left).not.toHaveBeenCalled();
  });

  describe("after the app was closed", () => {
    it("clears A's things when B signs in over a session the server ended", async () => {
      storedItems.set(LEFTOVERS_OWNER_KEY, "a");
      const { left, moveTo } = await setUp();
      moveTo(signedOut(false));
      expect(left).not.toHaveBeenCalled();
      moveTo(signedIn("b"));
      expect(left).toHaveBeenCalledTimes(1);
      await settle();
      expect(storedItems.get(LEFTOVERS_OWNER_KEY)).toBe("b");
    });

    it("keeps A's things when A signs back in", async () => {
      storedItems.set(LEFTOVERS_OWNER_KEY, "a");
      const { left, moveTo } = await setUp();
      moveTo(signedOut(false));
      moveTo(signedIn("a"));
      expect(left).not.toHaveBeenCalled();
    });

    it("clears nothing when the phone doesn't know whose things are on it", async () => {
      const { left, moveTo } = await setUp();
      moveTo(signedOut(false));
      moveTo(signedIn("b"));
      expect(left).not.toHaveBeenCalled();
      await settle();
      expect(storedItems.get(LEFTOVERS_OWNER_KEY)).toBe("b");
    });

    it("handles a sign-in that arrives before the phone has answered", async () => {
      storedItems.set(LEFTOVERS_OWNER_KEY, "a");
      const { left, moveTo } = await setUp({ settle: false });
      moveTo(signedIn("b"));
      await settle();
      expect(left).toHaveBeenCalledTimes(1);
    });

    it("forgets the owner on an explicit sign-out", async () => {
      const { moveTo } = await setUp();
      moveTo(signedIn("a"));
      await settle();
      expect(storedItems.get(LEFTOVERS_OWNER_KEY)).toBe("a");
      moveTo(signedOut(false));
      await settle();
      expect(storedItems.has(LEFTOVERS_OWNER_KEY)).toBe(false);
    });
  });
});
