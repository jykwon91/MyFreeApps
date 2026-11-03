import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { AccessibilityInfo, StyleSheet } from "react-native";
import { Provider } from "react-redux";
import { recipesApi } from "@myrecipes/api-client/store/recipesApi";
import { COOK_SESSION_MAX_AGE_MS } from "../src/constants/cook";
import { pageChanged } from "../src/features/cook/cookSessionsSlice";
import CookScreen from "../src/features/cook/CookScreen";
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
});
