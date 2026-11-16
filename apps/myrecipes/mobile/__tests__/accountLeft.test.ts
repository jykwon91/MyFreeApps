import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import * as Notifications from "expo-notifications";
import { saveCookCopy } from "../src/features/cook/cookCopies";
import { sessionOpened } from "../src/features/cook/cookSessionsSlice";
import { timerStarted } from "../src/features/cook/cookTimersSlice";
import { store } from "../src/lib/store";
import { session } from "../src/lib/session";

jest.mock("expo-notifications", () => ({
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  dismissAllNotificationsAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));

jest.mock("../src/lib/session", () => {
  let state = { status: "signedIn", email: "a@example.com", sessionId: "s" };
  const listeners = new Set<() => void>();
  return {
    session: {
      tokenStore: { get: () => null, set: () => {}, clear: () => {} },
      refreshSession: () => Promise.resolve("unavailable"),
      currentAccount: () => null,
      getState: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      moveTo: (next: typeof state) => {
        state = next;
        listeners.forEach((listener) => listener());
      },
    },
  };
});

const moveTo = (session as unknown as { moveTo: (state: unknown) => void }).moveTo;

it("clears what someone was cooking when they sign out", () => {
  moveTo({ status: "signedIn", email: "a@example.com", sessionId: "s" });
  store.dispatch(
    timerStarted({ id: "t", recipeId: "r", label: "Simmer", seconds: 60, endsAt: Date.now() + 60000, alert: "scheduled" } as never),
  );
  store.dispatch(sessionOpened({ recipeId: "r", versionId: "v", now: 1, lastPage: 1 }));

  moveTo({ status: "signedOut", endedByServer: false, lastEmail: "a@example.com" });

  expect(store.getState().cookTimers.items).toEqual([]);
  expect(store.getState().cookSessions).toEqual({});
  expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
});

it("deletes the recipes saved for cooking offline when someone signs out", () => {
  resetFakeFiles();
  moveTo({ status: "signedIn", email: "a@example.com", sessionId: "s" });
  saveCookCopy("r", "Soup", { id: "v", ingredients: [], steps: [] } as never);
  expect(fakeFiles()).toHaveLength(1);

  moveTo({ status: "signedOut", endedByServer: false, lastEmail: "a@example.com" });

  expect(fakeFiles()).toEqual([]);
});

it("deletes them when the account is deleted", () => {
  resetFakeFiles();
  moveTo({ status: "signedIn", email: "a@example.com", sessionId: "s" });
  saveCookCopy("r", "Soup", { id: "v", ingredients: [], steps: [] } as never);

  moveTo({ status: "signedOut", endedByServer: false, lastEmail: null, accountDeleted: "confirmed" });

  expect(fakeFiles()).toEqual([]);
});
