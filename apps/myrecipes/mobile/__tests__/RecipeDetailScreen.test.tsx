import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { AccessibilityInfo, AppState } from "react-native";
import { Provider } from "react-redux";
import RecipeDetailScreen from "../src/features/recipes/RecipeDetailScreen";
import { pageChanged } from "../src/features/cook/cookSessionsSlice";
import { COOK_SESSION_MAX_AGE_MS } from "../src/constants/cook";
import { makeStore } from "../src/lib/store";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockFocus = new Set<() => void>();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockParams: { id: string; title?: string; owner?: string; from?: string };
let mockScreenOptions: { headerBackTitle?: string } | undefined;
jest.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options?: { headerBackTitle?: string } }) => {
      mockScreenOptions = options;
      return null;
    },
  },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      mockFocus.add(callback);
      callback();
      return () => {
        mockFocus.delete(callback);
      };
    }, [callback]);
  },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, canGoBack: () => mockCanGoBack, push: mockPush, replace: mockReplace }),
}));

const VERSION = {
  id: "v1",
  version_number: 1,
  change_note: null,
  servings: "4",
  prep_minutes: 15,
  cook_minutes: 0,
  ingredients: [
    { id: "i2", position: 2, name: "basil", quantity: null, unit: null, note: null },
    { id: "i1", position: 1, name: "tomatoes", quantity: 2, unit: "cans", note: "crushed" },
  ],
  steps: [
    { id: "s2", position: 2, instruction: "Simmer it." },
    { id: "s1", position: 1, instruction: "Open the cans." },
  ],
};
const SOUP = {
  id: "r1",
  title: "Tomato soup",
  description: "A weeknight soup that keeps going past two lines on purpose.",
  source: "Grandma",
  owner_display_name: "Sam",
  latest_version: VERSION,
};

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

function show() {
  store = makeStore();
  return render(
    <Provider store={store}>
      <RecipeDetailScreen />
    </Provider>,
  );
}

function reopen() {
  return render(
    <Provider store={store}>
      <RecipeDetailScreen />
    </Provider>,
  );
}

function holdResponses(): () => void {
  let open = () => {};
  gate = new Promise((resolve) => {
    open = resolve;
  });
  return open;
}

async function pullToRefresh() {
  await act(async () => {
    await screen.getByTestId("recipe-detail").props.refreshControl.props.onRefresh();
  });
}

beforeEach(() => {
  api.defaults.adapter = adapter;
  mockBack.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
  mockCanGoBack = true;
  mockParams = { id: "r1", title: "Tomato soup", owner: "Sam" };
  gate = Promise.resolve();
  requestCount = 0;
  reply = { status: 200, data: SOUP };
});

afterEach(async () => {
  // React Native's preset makes the announce function a shared mock, so its calls carry over.
  jest.clearAllMocks();
  jest.restoreAllMocks();
  await act(async () => {
    store.dispatch(baseApi.util.resetApiState());
  });
});

describe("RecipeDetailScreen", () => {
  it("opens with what the list passed, then fills in the recipe", async () => {
    const open = holdResponses();
    await show();

    expect(screen.getByRole("header", { name: "Tomato soup" })).toBeTruthy();
    expect(screen.getByText("by Sam")).toBeTruthy();
    expect(screen.getByLabelText("Loading recipe")).toBeTruthy();
    expect(screen.queryByText("Recipe not found")).toBeNull();

    open();
    expect(await screen.findByText("Source: Grandma")).toBeTruthy();
    expect(screen.getByText(/A weeknight soup/)).toBeTruthy();
    expect(screen.queryByLabelText("Loading recipe")).toBeNull();
    expect(screen.getByLabelText("Servings: 4").props.accessible).toBe(true);
    expect(screen.getByLabelText("Prep: 15 min")).toBeTruthy();
    expect(screen.queryByLabelText(/^Cook/)).toBeNull();
  });

  it("names Back for where it was opened from: Recipes, or Discover", async () => {
    await show();
    expect(mockScreenOptions?.headerBackTitle).toBe("Recipes");

    mockParams = { id: "r1", from: "discover" };
    await reopen();
    expect(mockScreenOptions?.headerBackTitle).toBe("Discover");
  });

  it("works from a deep link with only an id, using the server's values", async () => {
    mockParams = { id: "r1" };
    const open = holdResponses();
    await show();
    expect(screen.queryByRole("header", { name: "Recipe" })).toBeNull();
    expect(screen.getByTestId("recipe-title-skeleton", { includeHiddenElements: true })).toBeTruthy();

    open();
    expect(await screen.findByRole("header", { name: "Tomato soup" })).toBeTruthy();
    expect(screen.getByText("by Sam")).toBeTruthy();
  });

  it("prefers the server's title when the recipe was renamed", async () => {
    mockParams = { id: "r1", title: "Old name" };
    reply = { status: 200, data: { ...SOUP, title: "New name" } };
    await show();

    expect(await screen.findByRole("header", { name: "New name" })).toBeTruthy();
    expect(screen.queryByText("Old name")).toBeNull();
  });

  it("lists ingredients and steps in the author's order", async () => {
    await show();
    await screen.findByText("2 cans tomatoes (crushed)");

    const lines = screen.getAllByText(/tomatoes|^basil$/).map((node) => node.props.children);
    expect(lines).toEqual(["2 cans tomatoes (crushed)", "basil"]);
    expect(screen.getByLabelText("Step 1. Open the cans.").props.accessible).toBe(true);
    expect(screen.getByLabelText("Step 2. Simmer it.").props.accessible).toBe(true);
  });

  it("offers its owner a tweak, which opens the tweak form once for a double tap", async () => {
    reply = { status: 200, data: { ...SOUP, is_owner: true } };
    await show();

    const tweak = await screen.findByRole("button", { name: "Tweak this recipe" });
    expect(tweak.props.accessibilityHint).toMatch(/new version/);
    await fireEvent.press(tweak);
    await fireEvent.press(tweak);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/recipes/[id]/tweak", params: { id: "r1" } });

    // Coming back to the recipe lets it open again.
    await act(async () => mockFocus.forEach((callback) => callback()));
    await fireEvent.press(tweak);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it("doesn't offer a tweak on someone else's recipe", async () => {
    reply = { status: 200, data: { ...SOUP, is_owner: false } };
    await show();

    await screen.findByRole("button", { name: "Start cooking" });
    expect(screen.queryByRole("button", { name: "Tweak this recipe" })).toBeNull();
  });

  it("offers everyone the version history, which opens once for a double tap", async () => {
    reply = { status: 200, data: { ...SOUP, is_owner: false, version_count: 3 } };
    await show();

    const history = await screen.findByRole("button", { name: "Version history" });
    expect(history.props.accessibilityHint).toBe("Shows all 3 versions and what changed in each.");
    await fireEvent.press(history);
    await fireEvent.press(history);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/recipes/[id]/versions", params: { id: "r1" } });
  });

  it("doesn't offer a history for a recipe with one version", async () => {
    reply = { status: 200, data: { ...SOUP, version_count: 1 } };
    await show();

    await screen.findByRole("button", { name: "Start cooking" });
    expect(screen.queryByRole("button", { name: "Version history" })).toBeNull();
  });

  it("offers cooking when there are steps, and opens the cook screen", async () => {
    await show();

    const start = await screen.findByRole("button", { name: "Start cooking" });
    expect(start.props.accessibilityHint).toMatch(/keeps your screen on/);
    await fireEvent.press(start);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/recipes/[id]/cook", params: { id: "r1" } });
  });

  it("offers to resume when there's progress on this version", async () => {
    await show();
    await screen.findByRole("button", { name: "Start cooking" });

    await act(async () => {
      store.dispatch(pageChanged({ recipeId: "r1", versionId: "v1", pageIndex: 1, now: Date.now() }));
    });

    expect(await screen.findByRole("button", { name: "Resume cooking" })).toBeTruthy();
  });

  it("opens the cook screen once for a double tap, and again after coming back", async () => {
    await show();
    const start = await screen.findByRole("button", { name: "Start cooking" });

    await fireEvent.press(start);
    await fireEvent.press(start);
    expect(mockPush).toHaveBeenCalledTimes(1);

    await act(async () => mockFocus.forEach((callback) => callback()));
    await fireEvent.press(start);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it("stops offering to resume once the progress has gone stale", async () => {
    const onAppState: Array<(state: string) => void> = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, listener: (state: string) => void) => {
      onAppState.push(listener);
      return { remove: jest.fn() };
    }) as never);
    await show();
    await screen.findByRole("button", { name: "Start cooking" });
    await act(async () => {
      store.dispatch(pageChanged({ recipeId: "r1", versionId: "v1", pageIndex: 1, now: Date.now() }));
    });
    expect(await screen.findByRole("button", { name: "Resume cooking" })).toBeTruthy();

    const later = Date.now() + COOK_SESSION_MAX_AGE_MS + 1;
    jest.spyOn(Date, "now").mockReturnValue(later);
    await act(async () => onAppState.forEach((listener) => listener("active")));

    expect(screen.getByRole("button", { name: "Start cooking" })).toBeTruthy();
  });

  it("doesn't offer cooking with no version", async () => {
    reply = { status: 200, data: { ...SOUP, latest_version: null } };
    await show();
    await screen.findByText("This recipe has no ingredients or steps yet.");
    expect(screen.queryByRole("button", { name: "Start cooking" })).toBeNull();
  });

  it("doesn't offer cooking with no steps, or while loading", async () => {
    const open = holdResponses();
    reply = { status: 200, data: { ...SOUP, latest_version: { ...VERSION, steps: [] } } };
    await show();
    expect(screen.queryByRole("button", { name: "Start cooking" })).toBeNull();
    open();
    await screen.findByText("No steps.");
    expect(screen.queryByRole("button", { name: "Start cooking" })).toBeNull();
  });

  it("says when a list is empty or the recipe has no version", async () => {
    reply = { status: 200, data: { ...SOUP, latest_version: { ...VERSION, ingredients: [], steps: [] } } };
    await show();
    expect(await screen.findByText("No ingredients.")).toBeTruthy();
    expect(screen.getByText("No steps.")).toBeTruthy();
  });

  it("doesn't hang on a recipe with no version", async () => {
    reply = { status: 200, data: { ...SOUP, latest_version: null } };
    await show();
    expect(await screen.findByText("This recipe has no ingredients or steps yet.")).toBeTruthy();
    expect(screen.queryByLabelText("Loading recipe")).toBeNull();
  });

  it("mentions the version only after the first", async () => {
    reply = { status: 200, data: { ...SOUP, latest_version: { ...VERSION, version_number: 3, change_note: "More salt" } } };
    await show();
    expect(await screen.findByText("Version 3 · More salt")).toBeTruthy();
  });

  it("stays quiet about the first version", async () => {
    await show();
    await screen.findByText("Source: Grandma");
    expect(screen.queryByText(/^Version \d/)).toBeNull();
  });

  it.each([404, 422])("says not found on a %i and offers a way back", async (status) => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    reply = { status, data: { detail: "nope" } };
    await show();

    expect(await screen.findByText("Recipe not found")).toBeTruthy();
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Recipe not found"));
    await fireEvent.press(screen.getByRole("button", { name: "Back to recipes" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("goes to the list when there's nothing to go back to", async () => {
    mockCanGoBack = false;
    reply = { status: 404, data: {} };
    await show();

    await fireEvent.press(await screen.findByRole("button", { name: "Back to recipes" }));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("doesn't call a dropped connection not found, and can retry", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    reply = "offline";
    await show();

    expect(await screen.findByText("Can't load this recipe")).toBeTruthy();
    expect(screen.queryByText("Recipe not found")).toBeNull();
    expect(screen.getByRole("header", { name: "Tomato soup" })).toBeTruthy();
    await waitFor(() => expect(announce).toHaveBeenCalledWith("Can't load this recipe"));

    const open = holdResponses();
    reply = { status: 200, data: SOUP };
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Loading recipe")).toBeTruthy();
    open();
    expect(await screen.findByText("Source: Grandma")).toBeTruthy();
  });

  it("shows no title placeholder once a deep link has failed", async () => {
    mockParams = { id: "r1" };
    reply = { status: 500, data: "boom" };
    await show();

    expect(await screen.findByText("Can't load this recipe")).toBeTruthy();
    expect(screen.queryByTestId("recipe-title-skeleton", { includeHiddenElements: true })).toBeNull();
  });

  it("keeps the recipe and shows a dismissible toast when a refresh fails", async () => {
    await show();
    await screen.findByText("Source: Grandma");

    reply = { status: 503, data: "down" };
    await pullToRefresh();

    expect(await screen.findByText(/Couldn't update this recipe/)).toBeTruthy();
    expect(screen.getByText("Source: Grandma")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Dismiss notification" }));
    await waitFor(() => expect(screen.queryByText(/Couldn't update this recipe/)).toBeNull());
    expect(screen.getByText("Source: Grandma")).toBeTruthy();
  });

  it("shows the spinner only while a refresh is running", async () => {
    await show();
    await screen.findByText("Source: Grandma");
    const spinner = () => screen.getByTestId("recipe-detail").props.refreshControl.props.refreshing;
    expect(spinner()).toBe(false);

    const open = holdResponses();
    const refreshing = pullToRefresh();
    await waitFor(() => expect(spinner()).toBe(true));
    open();
    await refreshing;
    await waitFor(() => expect(spinner()).toBe(false));
  });

  it("asks again on reopening instead of repeating a failed refresh", async () => {
    const first = await show();
    await screen.findByText("Source: Grandma");
    reply = { status: 503, data: "down" };
    await pullToRefresh();
    await screen.findByText(/Couldn't update this recipe/);
    await first.unmount();

    reply = { status: 200, data: SOUP };
    const before = requestCount;
    await reopen();

    expect(screen.queryByText(/Couldn't update this recipe/)).toBeNull();
    await waitFor(() => expect(requestCount).toBe(before + 1));
    expect(await screen.findByText("Source: Grandma")).toBeTruthy();
  });

  it("doesn't announce an old not-found when reopening a recipe that's back", async () => {
    reply = { status: 404, data: {} };
    const first = await show();
    await screen.findByText("Recipe not found");
    await first.unmount();

    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce.mockClear();
    const open = holdResponses();
    reply = { status: 200, data: SOUP };
    await reopen();

    expect(await screen.findByLabelText("Loading recipe")).toBeTruthy();
    expect(screen.queryByText("Recipe not found")).toBeNull();
    open();
    expect(await screen.findByText("Source: Grandma")).toBeTruthy();
    expect(announce).not.toHaveBeenCalledWith("Recipe not found");
  });

  it("says not found when a refresh finds the recipe has gone", async () => {
    await show();
    await screen.findByText("Source: Grandma");

    reply = { status: 404, data: {} };
    await pullToRefresh();

    expect(await screen.findByText("Recipe not found")).toBeTruthy();
    expect(screen.queryByText("Source: Grandma")).toBeNull();
  });
});
