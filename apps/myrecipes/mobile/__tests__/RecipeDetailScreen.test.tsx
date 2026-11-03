import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { AccessibilityInfo } from "react-native";
import { Provider } from "react-redux";
import RecipeDetailScreen from "../src/features/recipes/RecipeDetailScreen";
import { makeStore } from "../src/lib/store";

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockParams: { id: string; title?: string; owner?: string };
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, canGoBack: () => mockCanGoBack, replace: mockReplace }),
}));

const VERSION = {
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
    expect(screen.queryByText(/^Version/)).toBeNull();
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
