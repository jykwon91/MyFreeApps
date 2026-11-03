import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { AccessibilityInfo, AppState, Platform, StyleSheet } from "react-native";
import { Provider } from "react-redux";
import { recipesApi } from "@myrecipes/api-client/store/recipesApi";
import { COOK_SESSION_MAX_AGE_MS } from "../src/constants/cook";
import { pageChanged } from "../src/features/cook/cookSessionsSlice";
import CookScreen from "../src/features/cook/CookScreen";
import { timersRestored } from "../src/features/cook/cookTimersSlice";
import { makeStore } from "../src/lib/store";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockKeepAwake = { active: 0 };
const mockSetPage = jest.fn();
const mockSetPageWithoutAnimation = jest.fn();
let mockCanGoBack = true;
let mockScreenOptions: object | undefined;

jest.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options: object }) => {
      mockScreenOptions = options;
      return null;
    },
  },
  useLocalSearchParams: () => ({ id: "r1" }),
  useRouter: () => ({ back: mockBack, canGoBack: () => mockCanGoBack, replace: mockReplace }),
}));

const mockNotifications = {
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  getPresentedNotificationsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getExactAlarmPermissionsAsync: jest.fn(),
  requestExactAlarmPermissionsAsync: jest.fn(),
  dismissNotificationAsync: jest.fn(),
};

jest.mock("expo-notifications", () => ({
  __esModule: true,
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  getPermissionsAsync: (...args: unknown[]) => mockNotifications.getPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockNotifications.requestPermissionsAsync(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockNotifications.scheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockNotifications.cancelScheduledNotificationAsync(...args),
  getAllScheduledNotificationsAsync: (...args: unknown[]) => mockNotifications.getAllScheduledNotificationsAsync(...args),
  getPresentedNotificationsAsync: (...args: unknown[]) => mockNotifications.getPresentedNotificationsAsync(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockNotifications.setNotificationChannelAsync(...args),
  getExactAlarmPermissionsAsync: (...args: unknown[]) => mockNotifications.getExactAlarmPermissionsAsync(...args),
  requestExactAlarmPermissionsAsync: (...args: unknown[]) => mockNotifications.requestExactAlarmPermissionsAsync(...args),
  dismissNotificationAsync: (...args: unknown[]) => mockNotifications.dismissNotificationAsync(...args),
}));

jest.mock("expo-keep-awake", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useKeepAwake: () =>
      useEffect(() => {
        mockKeepAwake.active += 1;
        return () => {
          mockKeepAwake.active -= 1;
        };
      }, []),
  };
});

jest.mock("react-native-pager-view", () => {
  const { useEffect, useImperativeHandle, useState } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: function MockPagerView({
      children,
      initialPage,
      onPageSelected,
      ref,
      ...props
    }: {
      children: unknown;
      initialPage: number;
      onPageSelected: (event: object) => void;
      ref: unknown;
    }) {
      const select = (position: number) => onPageSelected({ nativeEvent: { position } });
      // The real pager reports the opening page too, on both platforms.
      const [opening] = useState(() => () => select(initialPage));
      useEffect(opening, [opening]);
      useImperativeHandle(ref, () => ({
        setPage: (position: number) => {
          mockSetPage(position);
          select(position);
        },
        setPageWithoutAnimation: (position: number) => {
          mockSetPageWithoutAnimation(position);
          select(position);
        },
      }));
      return <View initialPage={initialPage} onPageSelected={onPageSelected} {...props}>{children}</View>;
    },
  };
});

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});

const VERSION = {
  id: "v1",
  version_number: 1,
  ingredients: [
    { id: "i1", position: 0, name: "tomatoes", quantity: 2, unit: "cans", note: null },
    { id: "i2", position: 1, name: "basil", quantity: null, unit: null, note: null },
  ],
  steps: [
    { id: "s1", position: 0, instruction: "Open the cans." },
    { id: "s2", position: 1, instruction: "Simmer it." },
  ],
};
const SOUP = { id: "r1", title: "Tomato soup", owner_display_name: "Sam", latest_version: VERSION };

type Reply = { status: number; data: unknown } | "offline";
let reply: Reply;
let gate: Promise<void> = Promise.resolve();
let store: ReturnType<typeof makeStore>;
let requestCount = 0;

const adapter: AxiosAdapter = async (config) => {
  requestCount += 1;
  await gate;
  if (reply === "offline") throw Object.assign(new Error("Network Error"), { config });
  const { status, data } = reply;
  if (status >= 400) throw Object.assign(new Error("failed"), { response: { status, data }, config });
  return { status, data, statusText: "", headers: {}, config };
};

function mount() {
  return render(
    <Provider store={store}>
      <CookScreen />
    </Provider>,
  );
}

async function open() {
  store = makeStore();
  const view = await mount();
  await screen.findByRole("header", { name: "Ingredients" });
  await waitFor(() => expect(screen.getAllByTestId("cook-tap-next", { includeHiddenElements: true })[0]!.props).toBeTruthy());
  return view;
}

function press(name: string) {
  return fireEvent.press(screen.getByRole("button", { name }));
}

function tapZone(id: "cook-tap-back" | "cook-tap-next", stepIndex: number) {
  return screen.getAllByTestId(id, { includeHiddenElements: true })[stepIndex]!;
}

beforeEach(() => {
  api.defaults.adapter = adapter;
  mockCanGoBack = true;
  mockScreenOptions = undefined;
  gate = Promise.resolve();
  requestCount = 0;
  reply = { status: 200, data: SOUP };
  mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  mockNotifications.requestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  mockNotifications.scheduleNotificationAsync.mockResolvedValue("id");
  mockNotifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  mockNotifications.getPresentedNotificationsAsync.mockResolvedValue([]);
  mockNotifications.setNotificationChannelAsync.mockResolvedValue(null);
  mockNotifications.getExactAlarmPermissionsAsync.mockResolvedValue({ granted: true });
  mockNotifications.requestExactAlarmPermissionsAsync.mockResolvedValue({ granted: true });
  mockNotifications.dismissNotificationAsync.mockResolvedValue(undefined);
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(false);
});

afterEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  await act(async () => {
    store.dispatch(baseApi.util.resetApiState());
  });
});

describe("CookScreen", () => {
  it("hides the header and the swipe-back gesture that would fight the pager", async () => {
    await open();
    expect(mockScreenOptions).toEqual({ headerShown: false, gestureEnabled: false });
  });

  it("walks ingredients, steps and the end with the right labels", async () => {
    await open();
    expect(screen.getByText("Your screen stays on while you cook.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" }).props.accessibilityState.disabled).toBe(true);

    await press("Start cooking");
    expect(screen.getByRole("header", { name: "Step 1 of 2" })).toBeTruthy();
    await press("Next");
    expect(screen.getByRole("header", { name: "Step 2 of 2" })).toBeTruthy();
    await press("Finish");
    expect(screen.getByRole("header", { name: "All done" })).toBeTruthy();

    await press("Back");
    expect(screen.getByRole("header", { name: "Step 2 of 2" })).toBeTruthy();
  });

  it("uses large step text that scrolls", async () => {
    await open();
    const style = StyleSheet.flatten(screen.getByText("Open the cans.", { includeHiddenElements: true }).props.style);
    expect(style.fontSize).toBeGreaterThanOrEqual(22);
    expect(screen.getAllByTestId("cook-step-scroll", { includeHiddenElements: true })).toHaveLength(2);
  });

  it("turns the page with the right and left halves", async () => {
    await open();
    await waitFor(() => expect(mockScreenOptions).toBeTruthy());
    await press("Start cooking");
    await waitFor(() => expect(tapZone("cook-tap-next", 0).props.accessibilityState?.disabled).not.toBe(true));

    await fireEvent.press(tapZone("cook-tap-next", 0));
    expect(screen.getByRole("header", { name: "Step 2 of 2" })).toBeTruthy();
    await fireEvent.press(tapZone("cook-tap-back", 1));
    expect(screen.getByRole("header", { name: "Step 1 of 2" })).toBeTruthy();
  });

  it("follows a swipe, shows progress and saves the page", async () => {
    await open();
    await act(async () => {
      screen.getByTestId("cook-pager").props.onPageSelected({ nativeEvent: { position: 2 } });
    });

    expect(screen.getByRole("header", { name: "Step 2 of 2" })).toBeTruthy();
    expect(store.getState().cookSessions.r1?.pageIndex).toBe(2);
    expect(StyleSheet.flatten(screen.getByTestId("cook-progress", { includeHiddenElements: true }).props.style).width).toBe(
      `${(2 / 3) * 100}%`,
    );
  });

  it("saves nothing just for opening", async () => {
    await open();
    expect(store.getState().cookSessions.r1).toBeUndefined();
  });

  it("switches off tap zones for a screen reader, leaving the buttons", async () => {
    jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(true);
    await open();
    await press("Start cooking");
    await act(async () => {});

    await fireEvent.press(tapZone("cook-tap-next", 0));
    expect(screen.getByRole("header", { name: "Step 1 of 2" })).toBeTruthy();
    await press("Next");
    expect(screen.getByRole("header", { name: "Step 2 of 2" })).toBeTruthy();
  });

  it("announces each page with its text and hides the others from a screen reader", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await open();
    await press("Start cooking");

    await waitFor(() => expect(announce).toHaveBeenCalledWith("Step 1 of 2. Open the cans."));
    expect(screen.getByTestId("cook-page-1").props.importantForAccessibility).toBe("auto");
    expect(screen.getByTestId("cook-page-2", { includeHiddenElements: true }).props.importantForAccessibility).toBe(
      "no-hide-descendants",
    );
  });

  it("doesn't animate pages under reduce motion", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    await open();
    await act(async () => {});
    await press("Start cooking");

    expect(mockSetPageWithoutAnimation).toHaveBeenCalledWith(1);
    expect(mockSetPage).not.toHaveBeenCalled();
  });

  it("keeps the screen on only while the recipe is open", async () => {
    const view = await open();
    expect(mockKeepAwake.active).toBe(1);
    await view.unmount();
    expect(mockKeepAwake.active).toBe(0);
  });

  it("ticks ingredients from the page and the sheet as one list", async () => {
    await open();
    const row = screen.getByRole("checkbox", { name: "2 cans tomatoes" });
    expect(row.props.accessibilityState.checked).toBe(false);
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(56);
    await fireEvent.press(row);
    expect(screen.getByRole("checkbox", { name: "2 cans tomatoes" }).props.accessibilityState.checked).toBe(true);

    await press("Start cooking");
    await press("Ingredients, 1 of 2 checked");
    const sheetRows = screen.getAllByRole("checkbox", { name: "basil" });
    await fireEvent.press(sheetRows[sheetRows.length - 1]!);
    expect(store.getState().cookSessions.r1?.checked).toEqual(["i1", "i2"]);

    await press("Close");
    expect(screen.getByRole("button", { name: "Ingredients, 2 of 2 checked" })).toBeTruthy();
  });

  it("omits ingredients entirely when the recipe has none", async () => {
    reply = { status: 200, data: { ...SOUP, latest_version: { ...VERSION, ingredients: [] } } };
    store = makeStore();
    await mount();

    expect(await screen.findByRole("header", { name: "Step 1 of 2" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Ingredients/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("exits without asking, keeping progress", async () => {
    await open();
    await press("Start cooking");
    await press("Exit cooking");

    expect(mockBack).toHaveBeenCalled();
    expect(store.getState().cookSessions.r1?.pageIndex).toBe(1);
  });

  it("lands on the recipe when there's nothing to go back to", async () => {
    mockCanGoBack = false;
    await open();
    await press("Exit cooking");
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/recipes/[id]", params: { id: "r1" } });
  });

  it("forgets progress when done", async () => {
    await open();
    await press("Start cooking");
    await press("Next");
    await press("Finish");
    await press("Done");

    expect(mockBack).toHaveBeenCalled();
    expect(store.getState().cookSessions.r1).toBeUndefined();
  });

  it("comes back to the same place after leaving", async () => {
    const view = await open();
    await fireEvent.press(screen.getByRole("checkbox", { name: "basil" }));
    await press("Start cooking");
    await press("Next");
    await view.unmount();

    await mount();
    expect(await screen.findByRole("header", { name: "Step 2 of 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ingredients, 1 of 2 checked" })).toBeTruthy();
    expect(screen.getByTestId("cook-pager").props.initialPage).toBe(2);
  });

  it("starts over when the saved progress is for another version", async () => {
    store = makeStore();
    store.dispatch(pageChanged({ recipeId: "r1", versionId: "old", pageIndex: 2, now: Date.now() }));
    await mount();

    expect(await screen.findByRole("header", { name: "Ingredients" })).toBeTruthy();
    expect(screen.getByTestId("cook-pager").props.initialPage).toBe(0);
    expect(store.getState().cookSessions.r1).toBeUndefined();
  });

  it("starts over when the saved progress is stale", async () => {
    store = makeStore();
    store.dispatch(pageChanged({ recipeId: "r1", versionId: "v1", pageIndex: 2, now: 0 }));
    await mount();

    expect(await screen.findByRole("header", { name: "Ingredients" })).toBeTruthy();
    expect(store.getState().cookSessions.r1).toBeUndefined();
  });

  it("starts over after leaving from the last page", async () => {
    const view = await open();
    await fireEvent.press(screen.getByRole("checkbox", { name: "basil" }));
    await press("Start cooking");
    await press("Next");
    await press("Finish");
    await view.unmount();

    await mount();
    expect(await screen.findByRole("header", { name: "Ingredients" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "basil" }).props.accessibilityState.checked).toBe(false);
  });

  it("keeps ticks and the page when a cook runs past the time limit", async () => {
    await open();
    await fireEvent.press(screen.getByRole("checkbox", { name: "basil" }));
    await press("Start cooking");
    const later = Date.now() + COOK_SESSION_MAX_AGE_MS + 1;
    jest.spyOn(Date, "now").mockReturnValue(later);

    await press("Next");
    expect(store.getState().cookSessions.r1).toMatchObject({ checked: ["i2"], pageIndex: 2 });

    await press("Ingredients, 1 of 2 checked");
    await fireEvent.press(screen.getAllByRole("checkbox", { name: "basil" }).at(-1)!);
    expect(store.getState().cookSessions.r1).toMatchObject({ checked: [], pageIndex: 2 });
  });

  it("doesn't throw someone out if a refetch finds no steps", async () => {
    await open();
    await press("Start cooking");
    reply = { status: 200, data: { ...SOUP, latest_version: null } };
    await act(async () => {
      await store.dispatch(recipesApi.endpoints.getRecipe.initiate("r1", { forceRefetch: true }));
    });

    expect(store.getState().api.queries['getRecipe("r1")']?.data).toMatchObject({ latest_version: null });
    expect(screen.getByRole("header", { name: "Step 1 of 2" })).toBeTruthy();
  });

  it("doesn't change the steps if the recipe changes mid-cook", async () => {
    await open();
    await press("Start cooking");
    reply = { status: 200, data: { ...SOUP, latest_version: { ...VERSION, id: "v2", steps: [VERSION.steps[1]] } } };
    await act(async () => {
      await store.dispatch(recipesApi.endpoints.getRecipe.initiate("r1", { forceRefetch: true }));
    });

    expect(store.getState().api.queries['getRecipe("r1")']?.data).toMatchObject({ latest_version: { id: "v2" } });
    expect(screen.getByRole("header", { name: "Step 1 of 2" })).toBeTruthy();
  });

  it("keeps working with no connection once loaded, with no more requests", async () => {
    await open();
    const before = requestCount;
    reply = "offline";

    await fireEvent.press(screen.getByRole("checkbox", { name: "basil" }));
    await press("Start cooking");
    await press("Next");

    expect(screen.getByRole("header", { name: "Step 2 of 2" })).toBeTruthy();
    expect(requestCount).toBe(before);
    expect(screen.queryByText("Can't load this recipe")).toBeNull();
  });

  it("shows a skeleton from a cold link, then the recipe", async () => {
    let release = () => {};
    gate = new Promise((resolve) => {
      release = resolve;
    });
    store = makeStore();
    await mount();

    expect(screen.getByLabelText("Loading recipe")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exit cooking" })).toBeTruthy();
    release();
    expect(await screen.findByRole("header", { name: "Ingredients" })).toBeTruthy();
  });

  it("offers a retry and an exit when a cold link fails", async () => {
    reply = "offline";
    store = makeStore();
    await mount();

    expect(await screen.findByText("Can't load this recipe")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exit cooking" })).toBeTruthy();

    reply = { status: 200, data: SOUP };
    await press("Try again");
    expect(await screen.findByRole("header", { name: "Ingredients" })).toBeTruthy();
  });

  it("says not found on a 404 from a cold link", async () => {
    reply = { status: 404, data: {} };
    store = makeStore();
    await mount();
    expect(await screen.findByText("Recipe not found")).toBeTruthy();
  });

  it("explains a recipe with nothing to cook", async () => {
    reply = { status: 200, data: { ...SOUP, latest_version: { ...VERSION, steps: [] } } };
    store = makeStore();
    await mount();
    expect(await screen.findByText("Nothing to cook yet")).toBeTruthy();
  });

  it("closes the sheet with Android's back button", async () => {
    await open();
    await press("Start cooking");
    await press("Ingredients, 0 of 2 checked");

    await fireEvent(screen.getByTestId("cook-ingredients-sheet"), "requestClose");
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  describe("timers", () => {
    const TIMED = {
      ...SOUP,
      latest_version: {
        ...VERSION,
        steps: [
          { id: "s1", position: 0, instruction: "Simmer 10 minutes, then rest 5 minutes." },
          { id: "s2", position: 1, instruction: "Serve." },
        ],
      },
    };

    const RUNNING_10 = "10 min timer, about 10 minutes left. Cancel";

    async function openTimed() {
      jest.spyOn(Date, "now").mockReturnValue(1_000_000);
      reply = { status: 200, data: TIMED };
      await open();
      await press("Start cooking");
    }

    async function startTen() {
      await press("Start 10 min timer");
      await waitFor(() => expect(store.getState().cookTimers.items[0]?.alert).not.toBe("pending"));
    }

    function setPlatform(os: "android" | "ios") {
      Object.defineProperty(Platform, "OS", { configurable: true, get: () => os });
    }

    afterEach(() => setPlatform("ios"));

    it("offers a timer for each wait in a step, and none where there isn't one", async () => {
      await openTimed();
      expect(screen.getByRole("button", { name: "Start 10 min timer" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Start 5 min timer" })).toBeTruthy();
      expect(screen.getAllByRole("button", { name: /^Start \d/, includeHiddenElements: true })).toHaveLength(2);
    });

    it("schedules an alert for the end time and shows it from every page", async () => {
      await openTimed();
      await startTen();

      const request = mockNotifications.scheduleNotificationAsync.mock.calls[0]![0];
      expect(request).toMatchObject({
        identifier: "s1-600",
        content: {
          title: "10 min timer is done",
          body: "Tomato soup, step 1",
          data: { timer: { id: "s1-600", recipeId: "r1", endsAt: 1_600_000 } },
        },
        trigger: { type: "date", date: new Date(1_600_000), channelId: "cook-timers" },
      });
      expect(screen.getByText("10:00 left", { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByRole("button", { name: RUNNING_10 })).toBeTruthy();
      expect(mockNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();

      await press("Next");
      expect(screen.getByText("Step 1 timer: 10:00")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Step 1, 10 min timer, about 10 minutes left" })).toBeTruthy();
    });

    it("what it schedules can be restored", async () => {
      await openTimed();
      await startTen();
      const { content } = mockNotifications.scheduleNotificationAsync.mock.calls[0]![0];
      mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([{ content }]);

      await act(async () => {
        store.dispatch(baseApi.util.resetApiState());
      });
      store = makeStore();
      await mount();

      expect(await screen.findByText("Step 1 timer: 10:00")).toBeTruthy();
    });

    it("cancels only on a second tap, removing the timer and its alert", async () => {
      await openTimed();
      await startTen();

      await press(RUNNING_10);
      expect(store.getState().cookTimers.items).toHaveLength(1);
      expect(mockNotifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();

      await press("Tap again to cancel the 10 min timer");
      expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("s1-600");
      await waitFor(() => expect(mockNotifications.dismissNotificationAsync).toHaveBeenCalledWith("s1-600"));
      expect(screen.getByRole("button", { name: "Start 10 min timer" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^Step 1, / })).toBeNull();
    });

    it("cancels the alert if the timer was cancelled during the permission prompt", async () => {
      let answer: (value: object) => void = () => {};
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
      mockNotifications.requestPermissionsAsync.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      await openTimed();
      await press("Start 10 min timer");
      await press(RUNNING_10);
      await press("Tap again to cancel the 10 min timer");
      mockNotifications.cancelScheduledNotificationAsync.mockClear();

      await act(async () => answer({ granted: true }));

      await waitFor(() => expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith("s1-600"));
      expect(store.getState().cookTimers.items).toEqual([]);
    });

    it("still runs in the app when notifications are off, and says so on every page", async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
      await openTimed();
      await startTen();

      expect(screen.getByText(/Notifications are off/)).toBeTruthy();
      expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: RUNNING_10 })).toBeTruthy();
      await press("Next");
      expect(screen.getByText(/Notifications are off/)).toBeTruthy();
    });

    it("says so when an alert can't be set, without blaming permissions", async () => {
      mockNotifications.scheduleNotificationAsync.mockRejectedValue(new Error("no"));
      await openTimed();
      await startTen();

      expect(screen.getByText(/Couldn't set an alert/)).toBeTruthy();
      expect(screen.queryByText(/Notifications are off/)).toBeNull();
    });

    it("asks once, only when a timer starts, even if the answer was no", async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
      mockNotifications.requestPermissionsAsync.mockResolvedValue({ granted: false });
      await openTimed();
      expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();

      await startTen();
      await press("Start 5 min timer");
      await waitFor(() => expect(store.getState().cookTimers.items).toHaveLength(2));
      await act(async () => {});

      expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it("doesn't schedule a timer that ran out during the prompt", async () => {
      let answer: (value: object) => void = () => {};
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
      mockNotifications.requestPermissionsAsync.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      await openTimed();
      await press("Start 10 min timer");
      jest.spyOn(Date, "now").mockReturnValue(2_000_000);

      await act(async () => answer({ granted: true }));

      expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
      expect(screen.queryByText(/Couldn't set an alert/)).toBeNull();
    });

    it("on Android, sets a channel and warns when alerts may be late, until exact ones are allowed", async () => {
      setPlatform("android");
      mockNotifications.getExactAlarmPermissionsAsync.mockResolvedValue({ granted: false });
      await openTimed();
      await startTen();

      expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        "cook-timers",
        expect.objectContaining({ importance: 4 }),
      );
      expect(screen.getByText(/may alert you late/)).toBeTruthy();

      mockNotifications.getExactAlarmPermissionsAsync.mockResolvedValue({ granted: true });
      await press("Allow exact alerts");

      await waitFor(() => expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByText(/may alert you late/)).toBeNull());
    });

    it("leaves the warning up if exact alerts aren't allowed", async () => {
      setPlatform("android");
      mockNotifications.getExactAlarmPermissionsAsync.mockResolvedValue({ granted: false });
      mockNotifications.requestExactAlarmPermissionsAsync.mockResolvedValue({ granted: false });
      await openTimed();
      await startTen();
      await press("Allow exact alerts");

      expect(screen.getByText(/may alert you late/)).toBeTruthy();
      expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });

    it("announces a finished timer once, and not again when another is dismissed", async () => {
      const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
      await openTimed();
      await startTen();
      await press("Start 5 min timer");

      jest.spyOn(Date, "now").mockReturnValue(1_000_000 + 700_000);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      });
      await waitFor(() => expect(announce).toHaveBeenCalledWith("Step 1, 10 min timer is done"));
      announce.mockClear();

      await press("Dismiss 5 min timer, done");
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      });

      expect(announce).not.toHaveBeenCalledWith("Step 1, 10 min timer is done");
      expect(store.getState().cookTimers.items).toHaveLength(1);
    });

    it("doesn't repeat the news about a timer already done when reopening", async () => {
      const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
      const timer = { id: "s1-600", recipeId: "r1", recipeTitle: "Tomato soup", stepNumber: 1, seconds: 600, endsAt: 500_000 };
      mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([{ content: { data: { timer } } }]);
      jest.spyOn(Date, "now").mockReturnValue(1_000_000);
      reply = { status: 200, data: TIMED };
      store = makeStore();
      store.dispatch(timersRestored([timer as never]));
      await mount();
      await screen.findByText("Step 1 timer: done");
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      });

      expect(announce).not.toHaveBeenCalledWith("Step 1, 10 min timer is done");
    });

    it("shows a running timer in the bar ahead of a finished one", async () => {
      await openTimed();
      await press("Start 5 min timer");
      jest.spyOn(Date, "now").mockReturnValue(1_000_000 + 400_000);
      await startTen();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      });

      expect(screen.getByText("Step 1 timer: 10:00, 2 timers")).toBeTruthy();
    });

    it("lists timers in a sheet, soonest first, closing it from the back button", async () => {
      await openTimed();
      await startTen();
      await press("Start 5 min timer");
      await act(async () => {});

      await press("Step 1, 5 min timer, about 5 minutes left, 2 timers");
      const rows = screen.getAllByText(/^Step 1, /).map((row) => row.props.children.join(""));
      expect(rows).toEqual(["Step 1, 5 min", "Step 1, 10 min"]);
      await fireEvent(screen.getByTestId("cook-timers-sheet"), "requestClose");
      expect(screen.queryByTestId("cook-timers-sheet")).toBeNull();
    });

    it("closes the sheet with the last timer, and doesn't reopen it for the next", async () => {
      await openTimed();
      await startTen();
      await press("Step 1, 10 min timer, about 10 minutes left");
      const inSheet = screen.getAllByRole("button", { name: RUNNING_10 }).at(-1)!;
      await fireEvent.press(inSheet);
      await fireEvent.press(screen.getByRole("button", { name: "Tap again to cancel the 10 min timer" }));
      expect(screen.queryByTestId("cook-timers-sheet")).toBeNull();

      await startTen();
      expect(screen.queryByTestId("cook-timers-sheet")).toBeNull();
    });

    it("restores timers still scheduled, ignoring anything else", async () => {
      const timer = { id: "s1-600", recipeId: "r1", recipeTitle: "Tomato soup", stepNumber: 1, seconds: 600, endsAt: 1_120_000 };
      mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([
        { content: { data: { timer } } },
        { content: { data: {} } },
        { content: { data: { timer: { id: "broken" } } } },
      ]);
      jest.spyOn(Date, "now").mockReturnValue(1_000_000);
      reply = { status: 200, data: TIMED };
      store = makeStore();
      await mount();

      expect(await screen.findByText("Step 1 timer: 2:00")).toBeTruthy();
      expect(store.getState().cookTimers.items).toEqual([{ ...timer, alert: "scheduled" }]);
    });

    it("doesn't show another recipe's timer", async () => {
      const timer = { id: "x", recipeId: "other", recipeTitle: "Bread", stepNumber: 1, seconds: 60, endsAt: Date.now() + 60_000 };
      mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([{ content: { data: { timer } } }]);
      await open();
      await waitFor(() => expect(store.getState().cookTimers.items).toHaveLength(1));
      expect(screen.queryByText(/timer:/)).toBeNull();
    });

    it("shows a timer that finished while the app was closed, from its alert", async () => {
      const timer = { id: "s1-600", recipeId: "r1", recipeTitle: "Tomato soup", stepNumber: 1, seconds: 600, endsAt: 500_000 };
      mockNotifications.getPresentedNotificationsAsync.mockResolvedValue([
        { request: { content: { data: { timer } } } },
        { request: { content: { data: {} } } },
      ]);
      jest.spyOn(Date, "now").mockReturnValue(1_000_000);
      reply = { status: 200, data: TIMED };
      store = makeStore();
      await mount();

      expect(await screen.findByText("Step 1 timer: done")).toBeTruthy();
      expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it("doesn't list a timer twice when it's both scheduled and showing", async () => {
      const timer = { id: "s1-600", recipeId: "r1", recipeTitle: "Tomato soup", stepNumber: 1, seconds: 600, endsAt: 1_120_000 };
      mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([{ content: { data: { timer } } }]);
      mockNotifications.getPresentedNotificationsAsync.mockResolvedValue([{ request: { content: { data: { timer } } } }]);
      jest.spyOn(Date, "now").mockReturnValue(1_000_000);
      reply = { status: 200, data: TIMED };
      store = makeStore();
      await mount();

      await screen.findByText("Step 1 timer: 2:00");
      expect(store.getState().cookTimers.items).toHaveLength(1);
    });

    it("keeps the late warning on a timer restored after the app was closed", async () => {
      setPlatform("android");
      mockNotifications.getExactAlarmPermissionsAsync.mockResolvedValue({ granted: false });
      const timer = { id: "s1-600", recipeId: "r1", recipeTitle: "Tomato soup", stepNumber: 1, seconds: 600, endsAt: 1_120_000 };
      mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([{ content: { data: { timer } } }]);
      jest.spyOn(Date, "now").mockReturnValue(1_000_000);
      reply = { status: 200, data: TIMED };
      store = makeStore();
      await mount();

      expect(await screen.findByText(/may alert you late/)).toBeTruthy();
    });

    it("says notifications are off on a restored timer once they've been turned off", async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
      const timer = { id: "s1-600", recipeId: "r1", recipeTitle: "Tomato soup", stepNumber: 1, seconds: 600, endsAt: 1_120_000 };
      mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([{ content: { data: { timer } } }]);
      jest.spyOn(Date, "now").mockReturnValue(1_000_000);
      reply = { status: 200, data: TIMED };
      store = makeStore();
      await mount();

      expect(await screen.findByText(/Notifications are off/)).toBeTruthy();
    });

    function captureAppState() {
      const listeners: Array<(state: string) => void> = [];
      jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, listener: (state: string) => void) => {
        listeners.push(listener);
        return { remove: jest.fn() };
      }) as never);
      return () => act(async () => listeners.forEach((listener) => listener("active")));
    }

    it("sets the alert after someone allows notifications in Settings and comes back", async () => {
      const comeBack = captureAppState();
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
      await openTimed();
      await startTen();
      expect(screen.getByText(/Notifications are off/)).toBeTruthy();

      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true });
      await comeBack();

      await waitFor(() => expect(screen.queryByText(/Notifications are off/)).toBeNull());
      expect(mockNotifications.scheduleNotificationAsync.mock.calls[0]![0]).toMatchObject({ identifier: "s1-600" });
    });

    it("updates a running timer's time on coming back to the app", async () => {
      const comeBack = captureAppState();
      await openTimed();
      await startTen();

      jest.spyOn(Date, "now").mockReturnValue(1_000_000 + 300_000);
      await comeBack();

      expect(await screen.findByText("5:00 left", { includeHiddenElements: true })).toBeTruthy();
    });

    it("sets the alert for a timer started while the permission prompt was coming up", async () => {
      let answer: (value: object) => void = () => {};
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
      mockNotifications.requestPermissionsAsync.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      await openTimed();
      await press("Start 10 min timer");
      await press("Start 5 min timer");
      await waitFor(() => expect(store.getState().cookTimers.items.map((timer) => timer.alert)).toContain("off"));

      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true });
      await act(async () => answer({ granted: true }));

      await waitFor(() =>
        expect(store.getState().cookTimers.items.map((timer) => timer.alert)).toEqual(["scheduled", "scheduled"]),
      );
    });

    it("doesn't cancel the alert of a timer restarted before its first alert was set", async () => {
      let answer: (value: object) => void = () => {};
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
      mockNotifications.requestPermissionsAsync.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      await openTimed();
      await press("Start 10 min timer");
      await press(RUNNING_10);
      await press("Tap again to cancel the 10 min timer");
      jest.spyOn(Date, "now").mockReturnValue(1_000_500);
      await press("Start 10 min timer");
      mockNotifications.cancelScheduledNotificationAsync.mockClear();
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true });

      await act(async () => answer({ granted: true }));

      await waitFor(() => expect(store.getState().cookTimers.items[0]?.alert).toBe("scheduled"));
      expect(store.getState().cookTimers.items[0]?.endsAt).toBe(1_600_500);
      expect(mockNotifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    });

    it("still removes a timer when cancelling its alert fails", async () => {
      mockNotifications.cancelScheduledNotificationAsync.mockRejectedValue(new Error("no"));
      await openTimed();
      await startTen();
      await press(RUNNING_10);
      await press("Tap again to cancel the 10 min timer");

      expect(store.getState().cookTimers.items).toEqual([]);
      expect(mockNotifications.dismissNotificationAsync).toHaveBeenCalledWith("s1-600");
    });

    it("warns rather than blames the alert when the exact alarm check fails", async () => {
      setPlatform("android");
      mockNotifications.getExactAlarmPermissionsAsync.mockRejectedValue(new Error("no"));
      await openTimed();
      await startTen();

      expect(screen.getByText(/may alert you late/)).toBeTruthy();
      expect(screen.queryByText(/Couldn't set an alert/)).toBeNull();
    });

    it("drops the cancel prompt after a while, and allows longer with a screen reader", async () => {
      const after = jest.spyOn(globalThis, "setTimeout");
      await openTimed();
      await startTen();
      await press(RUNNING_10);
      const reset = after.mock.calls.find((call) => call[1] === 4000)!;
      await act(async () => (reset[0] as () => void)());
      expect(screen.getByRole("button", { name: RUNNING_10 })).toBeTruthy();

      await act(async () => {
        await store.dispatch(timersRestored([]));
      });
      jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(true);
      await act(async () => {
        await screen.unmount();
      });
      after.mockClear();
      await mount();
      await screen.findByRole("button", { name: RUNNING_10 });
      await press(RUNNING_10);
      expect(after.mock.calls.some((call) => call[1] === 10000)).toBe(true);
    });

    it("tells a screen reader what each press did", async () => {
      const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
      await openTimed();
      await startTen();
      expect(announce).toHaveBeenCalledWith("10 min timer started");

      await press(RUNNING_10);
      expect(announce).toHaveBeenCalledWith("Tap again to cancel");

      await press("Tap again to cancel the 10 min timer");
      expect(announce).toHaveBeenCalledWith("Timer removed");
    });

    it("tells a screen reader when an alert can't be relied on", async () => {
      const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
      await openTimed();
      await startTen();

      expect(announce).toHaveBeenCalledWith(expect.stringMatching(/^Notifications are off/));
    });

    it("drops the alert note once the timer it's about has finished", async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
      await openTimed();
      await startTen();

      jest.spyOn(Date, "now").mockReturnValue(1_000_000 + 700_000);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      });

      expect(screen.getByText("Step 1 timer: done")).toBeTruthy();
      expect(screen.queryByText(/Notifications are off/)).toBeNull();
    });

    it("leaves timers and alerts alone on leaving the cook screen", async () => {
      await openTimed();
      await startTen();
      await screen.unmount();

      expect(store.getState().cookTimers.items).toHaveLength(1);
      expect(mockNotifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    });
  });
});
