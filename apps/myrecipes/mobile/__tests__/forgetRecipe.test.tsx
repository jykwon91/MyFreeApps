import { fakeFiles, resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { act, render, screen } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { Provider } from "react-redux";
import { loadCookCopy, saveCookCopy } from "../src/features/cook/cookCopies";
import { pageChanged } from "../src/features/cook/cookSessionsSlice";
import { timerStarted } from "../src/features/cook/cookTimersSlice";
import DiscoverySaveAction from "../src/features/discovery/DiscoverySaveAction";
import { recipeSaved } from "../src/features/discovery/discoverySlice";
import { forgetRecipe } from "../src/features/forgetRecipe/forgetRecipe";
import { makeStore } from "../src/lib/store";
import type { CookTimer } from "../src/types/CookTimer";

jest.mock("expo-notifications", () => ({
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  dismissAllNotificationsAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../src/lib/session", () => ({
  session: {
    tokenStore: { get: () => null, set: () => {}, clear: () => {} },
    refreshSession: () => Promise.resolve("unavailable"),
    currentAccount: () => null,
    getState: () => ({ status: "signedIn", email: "a@example.com", sessionId: "s" }),
    subscribe: () => () => {},
  },
}));

const VERSION = { id: "v", ingredients: [], steps: [] } as never;
const timer = (id: string, recipeId: string): CookTimer => ({
  id,
  recipeId,
  recipeTitle: "Soup",
  stepNumber: 1,
  seconds: 60,
  endsAt: Date.now() + 60000,
  alert: "scheduled",
});

function startCooking(store: ReturnType<typeof makeStore>, recipeId: string, timerId: string) {
  store.dispatch(recipeSaved({ resultId: `res-${recipeId}`, recipeId, generation: store.getState().discovery.generation }));
  store.dispatch(pageChanged({ recipeId, versionId: "v", now: 1, pageIndex: 1 }));
  store.dispatch(timerStarted(timer(timerId, recipeId)));
  saveCookCopy(recipeId, "Soup", VERSION);
}

beforeEach(() => {
  resetFakeFiles();
  jest.clearAllMocks();
});

it("forgets a deleted recipe's Discover save, timers, alerts and offline copy, and keeps the others", () => {
  const store = makeStore();
  startCooking(store, "gone", "t-gone");
  startCooking(store, "kept", "t-kept");

  store.dispatch(forgetRecipe("gone"));

  expect(store.getState().discovery.saved).toEqual({ "res-kept": "kept" });
  expect(store.getState().cookTimers.items.map((item) => item.id)).toEqual(["t-kept"]);
  expect(Object.keys(store.getState().cookSessions)).toEqual(["kept"]);
  expect(loadCookCopy("gone")).toBeNull();
  expect(loadCookCopy("kept")).not.toBeNull();
  expect(fakeFiles()).toHaveLength(1);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("t-gone");
});

it("puts a Discover result back to Save once the recipe saved from it is deleted", async () => {
  const store = makeStore();
  store.dispatch(recipeSaved({ resultId: "flan1", recipeId: "r1", generation: 0 }));
  await render(
    <Provider store={store}>
      <DiscoverySaveAction resultId="flan1" />
    </Provider>,
  );
  expect(screen.getByText("Open saved recipe")).toBeTruthy();

  await act(async () => {
    store.dispatch(forgetRecipe("r1"));
  });

  expect(screen.getByText("Save to my recipes")).toBeTruthy();
  expect(screen.queryByText("Open saved recipe")).toBeNull();
});
