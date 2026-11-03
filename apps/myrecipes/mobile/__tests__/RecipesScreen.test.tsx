import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { AccessibilityInfo } from "react-native";
import { Provider } from "react-redux";
import RecipesScreen from "../src/features/recipes/RecipesScreen";
import { makeStore } from "../src/lib/store";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

const SOUP = {
  id: "r1",
  title: "Tomato soup",
  description: "Weeknight soup",
  version_count: 3,
  owner_display_name: "Sam",
};

type Respond = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };
let respond: Respond;
let gate: Promise<void> = Promise.resolve();
let store: ReturnType<typeof makeStore>;
const requests: InternalAxiosRequestConfig[] = [];

const adapter: AxiosAdapter = async (config) => {
  requests.push(config);
  await gate;
  const { status, data } = respond(config);
  if (status >= 400) {
    throw Object.assign(new Error("failed"), { response: { status, data }, config });
  }
  return { status, data, statusText: "", headers: {}, config };
};

function show() {
  store = makeStore();
  return render(
    <Provider store={store}>
      <RecipesScreen />
    </Provider>,
  );
}

async function pullToRefresh() {
  await act(async () => {
    await screen.getByTestId("recipe-list").props.refreshControl.props.onRefresh();
  });
}

async function typeSearch(text: string) {
  await fireEvent.changeText(screen.getByLabelText("Search recipes by title"), text);
}

beforeEach(() => {
  api.defaults.adapter = adapter;
  requests.length = 0;
  mockPush.mockClear();
  gate = Promise.resolve();
  respond = () => ({ status: 200, data: [SOUP] });
});

afterEach(() => {
  // React Native's preset makes the announce function a shared mock, so its calls carry over.
  jest.clearAllMocks();
  // Clears the cache's expiry timers, which would otherwise outlive the test.
  store.dispatch(baseApi.util.resetApiState());
});

describe("RecipesScreen", () => {
  it("shows a skeleton first, then the recipes", async () => {
    let open = () => {};
    gate = new Promise((resolve) => {
      open = resolve;
    });
    await show();
    expect(screen.getByLabelText("Loading recipes")).toBeTruthy();

    open();
    expect(await screen.findByText("Tomato soup")).toBeTruthy();
    expect(screen.getByText("Weeknight soup")).toBeTruthy();
    expect(screen.getByText("3 versions")).toBeTruthy();
    expect(screen.getByText("by Sam")).toBeTruthy();
    expect(screen.queryByLabelText("Loading recipes")).toBeNull();
  });

  it("reads a card as one element and opens the recipe", async () => {
    await show();
    const card = await screen.findByRole("button", { name: "Tomato soup, 3 versions, by Sam" });

    await fireEvent.press(card);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/recipes/[id]",
      params: { id: "r1", title: "Tomato soup", owner: "Sam" },
    });
  });

  it("explains an empty library without offering anything it can't do", async () => {
    respond = () => ({ status: 200, data: [] });
    await show();

    expect(await screen.findByText("No recipes yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /new recipe/i })).toBeNull();
  });

  it("waits for typing to stop, then searches and announces the count", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await show();
    await screen.findByText("Tomato soup");
    requests.length = 0;

    await typeSearch("s");
    await typeSearch("  soup ");
    expect(requests).toHaveLength(0);

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.params).toEqual({ search: "soup" });
    await waitFor(() => expect(announce).toHaveBeenCalledWith("1 recipe"));
  });

  it("offers a way out of a search with no matches", async () => {
    respond = (config) => ({ status: 200, data: config.params?.search ? [] : [SOUP] });
    await show();
    await screen.findByText("Tomato soup");

    await typeSearch("zzz");
    expect(await screen.findByText("No matches")).toBeTruthy();
    expect(screen.getByText(/Nothing matches "zzz"/)).toBeTruthy();

    await fireEvent.press(screen.getAllByRole("button", { name: "Clear search" })[1]!);
    expect(await screen.findByText("Tomato soup")).toBeTruthy();
    expect(screen.getByLabelText("Search recipes by title").props.value).toBe("");
  });

  it("recovers from a failed first load with Try again, and hides the status code", async () => {
    respond = () => ({ status: 502, data: "bad gateway" });
    await show();

    expect(await screen.findByText("Can't load recipes")).toBeTruthy();
    expect(screen.queryByText(/502/)).toBeNull();

    respond = () => ({ status: 200, data: [SOUP] });
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Tomato soup")).toBeTruthy();
  });

  it("keeps the rows and shows a toast when refreshing them fails", async () => {
    await show();
    await screen.findByText("Tomato soup");

    respond = () => ({ status: 503, data: "down" });
    await pullToRefresh();

    expect(await screen.findByText(/Couldn't update the list/)).toBeTruthy();
    expect(screen.getByText("Tomato soup")).toBeTruthy();
    expect(screen.queryByText("Can't load recipes")).toBeNull();
  });

  it("never shows another search's rows when a search fails", async () => {
    await show();
    await screen.findByText("Tomato soup");

    respond = () => ({ status: 503, data: "down" });
    await typeSearch("pizza");

    expect(await screen.findByText("Can't load recipes")).toBeTruthy();
    expect(screen.queryByText("Tomato soup")).toBeNull();
    expect(screen.queryByText(/Couldn't update the list/)).toBeNull();
  });

  it("shows one error, not two, when a search fails over an empty list", async () => {
    respond = () => ({ status: 200, data: [] });
    await show();
    await screen.findByText("No recipes yet");

    respond = () => ({ status: 503, data: "down" });
    await typeSearch("pizza");

    expect(await screen.findByText("Can't load recipes")).toBeTruthy();
    expect(screen.queryByText(/Couldn't update the list/)).toBeNull();
  });

  it("says it's loading, not that there's nothing, while retrying", async () => {
    respond = () => ({ status: 502, data: "bad gateway" });
    await show();
    await screen.findByText("Can't load recipes");

    let open = () => {};
    gate = new Promise((resolve) => {
      open = resolve;
    });
    respond = () => ({ status: 200, data: [SOUP] });
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByLabelText("Loading recipes")).toBeTruthy();
    expect(screen.queryByText("No recipes yet")).toBeNull();
    open();
    expect(await screen.findByText("Tomato soup")).toBeTruthy();
  });

  it("doesn't repeat no-matches for the old term while the next search runs", async () => {
    respond = (config) => ({ status: 200, data: config.params?.search === "soup" ? [SOUP] : [] });
    await show();
    await screen.findByText("No recipes yet");
    await typeSearch("zzz");
    await screen.findByText("No matches");

    let open = () => {};
    gate = new Promise((resolve) => {
      open = resolve;
    });
    requests.length = 0;
    await typeSearch("soup");
    await waitFor(() => expect(requests).toHaveLength(1));

    expect(await screen.findByLabelText("Loading recipes")).toBeTruthy();
    expect(screen.queryByText("No matches")).toBeNull();
    open();
    expect(await screen.findByText("Tomato soup")).toBeTruthy();
  });

  it("doesn't bring a cleared search back when typing again right away", async () => {
    respond = (config) => ({ status: 200, data: config.params?.search ? [] : [SOUP] });
    await show();
    await screen.findByText("Tomato soup");
    await typeSearch("zzz");
    await screen.findByText("No matches");

    await fireEvent.press(screen.getAllByRole("button", { name: "Clear search" })[0]!);
    await typeSearch("b");

    expect(screen.queryByText(/Nothing matches "zzz"/)).toBeNull();
  });

  it("doesn't bring a search back after deleting its text and typing again", async () => {
    respond = (config) => ({ status: 200, data: config.params?.search ? [] : [SOUP] });
    await show();
    await screen.findByText("Tomato soup");
    await typeSearch("zzz");
    await screen.findByText("No matches");

    await typeSearch("");
    await typeSearch("b");

    expect(screen.queryByText(/Nothing matches "zzz"/)).toBeNull();
  });

  it("keeps the toast away once dismissed, until the next failure", async () => {
    await show();
    await screen.findByText("Tomato soup");

    respond = () => ({ status: 503, data: "down" });
    await pullToRefresh();
    await screen.findByText(/Couldn't update the list/);

    await fireEvent.press(screen.getByRole("button", { name: "Dismiss notification" }));
    await waitFor(() => expect(screen.queryByText(/Couldn't update the list/)).toBeNull());
    expect(screen.getByText("Tomato soup")).toBeTruthy();

    await pullToRefresh();
    expect(await screen.findByText(/Couldn't update the list/)).toBeTruthy();
  });

  it("announces a failed load", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    respond = () => ({ status: 503, data: "down" });
    await show();

    await waitFor(() => expect(announce).toHaveBeenCalledWith("Can't load recipes"));
  });
});
