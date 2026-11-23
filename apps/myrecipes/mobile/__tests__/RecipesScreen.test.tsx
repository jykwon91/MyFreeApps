import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { SessionProvider, type MobileSession, type SessionState } from "@platform/mobile";
import { resetFakeFiles } from "@platform/mobile/test-support/fakeFileSystem";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { AccessibilityInfo, AppState } from "react-native";
import type { AppStateStatus } from "react-native";
import { Provider } from "react-redux";
import { RECIPES_MINE_EMPTY_COPY } from "@myrecipes/api-client/constants/recipesListCopy";
import { RECIPES_PAGE_SIZE } from "@myrecipes/api-client/constants/recipesPaging";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { saveCookCopy } from "../src/features/cook/cookCopies";
import RecipesScreen from "../src/features/recipes/RecipesScreen";
import { makeStore, store as appStore } from "../src/lib/store";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock("expo-file-system", () => jest.requireActual("@platform/mobile/test-support/fakeFileSystem"));

// Saved cook copies belong to whoever the app's session says is signed in.
jest.mock("../src/lib/session", () => ({
  session: {
    tokenStore: { get: () => null, set: () => {}, clear: () => {} },
    refreshSession: () => Promise.resolve("unavailable"),
    currentAccount: () => null,
    getState: () => ({ status: "signedIn", email: "a@example.com", sessionId: "s" }),
    subscribe: () => () => {},
  },
}));

const SOUP = {
  id: "r1",
  title: "Tomato soup",
  description: "Weeknight soup",
  version_count: 3,
  latest_version_number: 3,
  is_owner: false,
  best_rating: null,
  last_cooked_at: null,
  owner_display_name: "Sam",
};

const MINE = { ...SOUP, id: "r2", title: "Pancakes", is_owner: true };

/** One GET /recipes page holding `items`, out of `total` matching recipes (all of them by default); `nextCursor` null on the last page. */
function pageOf<T>(items: T[], total = items.length, nextCursor: string | null = null) {
  return { items, total, has_more: nextCursor !== null, next_cursor: nextCursor };
}

/** Recipe n of a library numbered from 1. */
const numbered = (n: number) => ({ ...SOUP, id: `n${n}`, title: `Recipe ${n}`, description: null });

const SIGNED_IN: SessionState = { status: "signedIn", email: "sam@example.com", sessionId: "s1" };
const SIGNED_OUT: SessionState = { status: "signedOut", endedByServer: false, lastEmail: null };

/** A session whose account the test can change, as signing out and in again does. */
function fakeSession(initial: SessionState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const session = {
    start: async () => {},
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as MobileSession;
  const become = async (next: SessionState) =>
    act(async () => {
      state = next;
      listeners.forEach((listener) => listener());
    });
  return { session, become };
}

type Respond = (config: InternalAxiosRequestConfig) => { status: number; data: unknown };
let respond: Respond;
let gate: Promise<void> = Promise.resolve();
let store: ReturnType<typeof makeStore>;
const requests: InternalAxiosRequestConfig[] = [];
// The app's store tells the API layer when the app comes back to the foreground, through the listener it adds as it loads.
const changeAppState = jest.mocked(AppState.addEventListener).mock.calls.find(([type]) => type === "change")?.[1] as (state: AppStateStatus) => void;

const adapter: AxiosAdapter = async (config) => {
  requests.push(config);
  await gate;
  const { status, data } = respond(config);
  if (status >= 400) {
    throw Object.assign(new Error("failed"), { response: { status, data }, config });
  }
  return { status, data, statusText: "", headers: {}, config };
};

async function show(state: SessionState = SIGNED_OUT) {
  const { session, become } = fakeSession(state);
  store = makeStore();
  await render(
    <Provider store={store}>
      <SessionProvider session={session}>
        <RecipesScreen />
      </SessionProvider>
    </Provider>,
  );
  return become;
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
  resetFakeFiles();
  api.defaults.adapter = adapter;
  requests.length = 0;
  mockPush.mockClear();
  gate = Promise.resolve();
  respond = () => ({ status: 200, data: pageOf([SOUP]) });
});

afterEach(() => {
  // React Native's preset makes the announce function a shared mock, so its calls carry over.
  jest.clearAllMocks();
  // Clears the cache's expiry timers, which would otherwise outlive the test.
  store.dispatch(baseApi.util.resetApiState());
});

describe("RecipesScreen", () => {
  it("reloads the list when the app comes back to the foreground, as the website does on focus", async () => {
    const { session } = fakeSession(SIGNED_OUT);
    store = appStore;
    await render(
      <Provider store={appStore}>
        <SessionProvider session={session}>
          <RecipesScreen />
        </SessionProvider>
      </Provider>,
    );
    const loads = () => requests.filter((config) => config.url === "/recipes").length;
    await waitFor(() => expect(loads()).toBe(1));

    await act(async () => changeAppState("background"));
    await act(async () => changeAppState("active"));

    await waitFor(() => expect(loads()).toBe(2));
  });

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
    const card = await screen.findByRole("button", { name: "Tomato soup, v3, 3 versions, by Sam" });

    await fireEvent.press(card);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/recipes/[id]",
      params: { id: "r1" },
    });
  });

  it("explains an empty library and offers to start one, as the website does", async () => {
    respond = () => ({ status: 200, data: pageOf([]) });
    await show();

    expect(await screen.findByText("No recipes yet")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "New recipe" }));
    expect(mockPush).toHaveBeenCalledWith("/recipes/new");
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
    expect(requests[0]?.params).toEqual({ search: "soup", limit: RECIPES_PAGE_SIZE });
    await waitFor(() => expect(announce).toHaveBeenCalledWith("1 recipe"));
  });

  it("offers a way out of a search with no matches", async () => {
    respond = (config) => ({ status: 200, data: pageOf(config.params?.search ? [] : [SOUP]) });
    await show();
    await screen.findByText("Tomato soup");

    await typeSearch("zzz");
    expect(await screen.findByText("No matches")).toBeTruthy();
    expect(screen.getByText(/Nothing matches "zzz"/)).toBeTruthy();

    await fireEvent.press(screen.getAllByRole("button", { name: "Clear search" })[1]!);
    expect(await screen.findByText("Tomato soup")).toBeTruthy();
    expect(screen.getByLabelText("Search recipes by title").props.value).toBe("");
  });

  it("offers My recipes only when signed in", async () => {
    await show();
    await screen.findByText("Tomato soup");
    expect(screen.queryByRole("checkbox", { name: "My recipes" })).toBeNull();
  });

  it("sends owner=me when My recipes is on, and drops it when off", async () => {
    respond = (config) => ({ status: 200, data: pageOf(config.params?.owner ? [MINE] : [SOUP]) });
    await show(SIGNED_IN);
    await screen.findByText("Tomato soup");
    const toggle = screen.getByRole("checkbox", { name: "My recipes" });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
    requests.length = 0;

    await fireEvent.press(toggle);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.params).toEqual({ owner: "me", limit: RECIPES_PAGE_SIZE });
    expect(await screen.findByText("Pancakes")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "My recipes" }).props.accessibilityState).toMatchObject({
      checked: true,
    });

    await fireEvent.press(screen.getByRole("checkbox", { name: "My recipes" }));
    // Back to the list that was asked for without owner, so its own rows return.
    expect(await screen.findByText("Tomato soup")).toBeTruthy();
    expect(screen.queryByText("Pancakes")).toBeNull();
  });

  it("keeps the filter on while the search changes", async () => {
    respond = (config) => ({
      status: 200,
      data: pageOf(config.params?.search ? [] : config.params?.owner ? [MINE] : [SOUP]),
    });
    await show(SIGNED_IN);
    await screen.findByText("Tomato soup");
    await fireEvent.press(screen.getByRole("checkbox", { name: "My recipes" }));
    await waitFor(() => expect(requests.at(-1)?.params).toEqual({ owner: "me", limit: RECIPES_PAGE_SIZE }));

    await typeSearch("soup");
    await waitFor(() =>
      expect(requests.at(-1)?.params).toEqual({ search: "soup", owner: "me", limit: RECIPES_PAGE_SIZE }),
    );

    await typeSearch("");
    expect(await screen.findByText("Pancakes")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "My recipes" }).props.accessibilityState).toMatchObject({
      checked: true,
    });
  });

  it("starts unfiltered for the next account after signing out", async () => {
    respond = (config) => ({ status: 200, data: pageOf(config.params?.owner ? [MINE] : [SOUP]) });
    const become = await show(SIGNED_IN);
    await screen.findByText("Tomato soup");
    await fireEvent.press(screen.getByRole("checkbox", { name: "My recipes" }));
    await screen.findByText("Pancakes");

    await become(SIGNED_OUT);
    expect(screen.queryByRole("checkbox", { name: "My recipes" })).toBeNull();
    expect(await screen.findByText("Tomato soup")).toBeTruthy();

    requests.length = 0;
    await become(SIGNED_IN);
    expect(screen.getByRole("checkbox", { name: "My recipes" }).props.accessibilityState).toMatchObject({
      checked: false,
    });
    expect(await screen.findByText("Tomato soup")).toBeTruthy();
    expect(screen.queryByText("Pancakes")).toBeNull();
    expect(requests.some((request) => request.params?.owner === "me")).toBe(false);
  });

  it("says so when the filter leaves nothing, and offers all recipes", async () => {
    respond = (config) => ({ status: 200, data: pageOf(config.params?.owner ? [] : [SOUP]) });
    await show(SIGNED_IN);
    await screen.findByText("Tomato soup");

    await fireEvent.press(screen.getByRole("checkbox", { name: "My recipes" }));
    expect(await screen.findByText(RECIPES_MINE_EMPTY_COPY.heading)).toBeTruthy();
    expect(screen.queryByText("No recipes yet")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: RECIPES_MINE_EMPTY_COPY.actionLabel }));
    expect(await screen.findByText("Tomato soup")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "My recipes" }).props.accessibilityState).toMatchObject({
      checked: false,
    });
  });

  it("recovers from a failed first load with Try again, and hides the status code", async () => {
    respond = () => ({ status: 502, data: "bad gateway" });
    await show();

    expect(await screen.findByText("Can't load recipes")).toBeTruthy();
    expect(screen.queryByText(/502/)).toBeNull();

    respond = () => ({ status: 200, data: pageOf([SOUP]) });
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
    respond = () => ({ status: 200, data: pageOf([]) });
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
    respond = () => ({ status: 200, data: pageOf([SOUP]) });
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByLabelText("Loading recipes")).toBeTruthy();
    expect(screen.queryByText("No recipes yet")).toBeNull();
    open();
    expect(await screen.findByText("Tomato soup")).toBeTruthy();
  });

  it("doesn't repeat no-matches for the old term while the next search runs", async () => {
    respond = (config) => ({ status: 200, data: pageOf(config.params?.search === "soup" ? [SOUP] : []) });
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
    respond = (config) => ({ status: 200, data: pageOf(config.params?.search ? [] : [SOUP]) });
    await show();
    await screen.findByText("Tomato soup");
    await typeSearch("zzz");
    await screen.findByText("No matches");

    await fireEvent.press(screen.getAllByRole("button", { name: "Clear search" })[0]!);
    await typeSearch("b");

    expect(screen.queryByText(/Nothing matches "zzz"/)).toBeNull();
  });

  it("doesn't bring a search back after deleting its text and typing again", async () => {
    respond = (config) => ({ status: 200, data: pageOf(config.params?.search ? [] : [SOUP]) });
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
  describe("paging", () => {
    const TOTAL = RECIPES_PAGE_SIZE + 5;
    const library = Array.from({ length: TOTAL }, (_, i) => numbered(i + 1));

    beforeEach(() => {
      respond = (config) => {
        // This fake server's cursor is the id of the last recipe a page held, like the real one's sort key.
        const cursor: string | undefined = config.params?.cursor;
        const matching = config.params?.search ? library.filter((r) => r.title === "Recipe 3") : library;
        const start = cursor === undefined ? 0 : matching.findIndex((r) => r.id === cursor) + 1;
        const items = matching.slice(start, start + RECIPES_PAGE_SIZE);
        const more = start + items.length < matching.length;
        return { status: 200, data: pageOf(items, matching.length, more ? items[items.length - 1]!.id : null) };
      };
    });

    // The list renders its rows a window at a time, so what it holds is read from its data.
    const listedTitles = (): string[] =>
      (screen.getByTestId("recipe-list").props.data as { title: string }[]).map(({ title }) => title);

    it("shows the page after the last recipe shown, recipe 51 on, under Show more", async () => {
      await show();
      await screen.findByText("Recipe 1");
      expect(await screen.findByText(`Showing ${RECIPES_PAGE_SIZE} of ${TOTAL} recipes`)).toBeTruthy();
      expect(listedTitles()).toHaveLength(RECIPES_PAGE_SIZE);

      await fireEvent.press(screen.getByRole("button", { name: "Show more" }));

      await waitFor(() =>
        expect(requests.map((r) => r.params?.cursor)).toEqual([undefined, `n${RECIPES_PAGE_SIZE}`]),
      );
      await waitFor(() => expect(listedTitles()).toHaveLength(TOTAL));
      expect(listedTitles().slice(RECIPES_PAGE_SIZE)).toEqual(library.slice(RECIPES_PAGE_SIZE).map(({ title }) => title));
      expect(listedTitles()[RECIPES_PAGE_SIZE]).toBe(`Recipe ${RECIPES_PAGE_SIZE + 1}`);
      expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    });

    it("starts a search from the first page", async () => {
      await show();
      await screen.findByText("Recipe 1");
      await fireEvent.press(await screen.findByRole("button", { name: "Show more" }));
      await waitFor(() => expect(requests).toHaveLength(2));
      requests.length = 0;

      await typeSearch("Recipe 3");

      await waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0]?.params).toEqual({ search: "Recipe 3", limit: RECIPES_PAGE_SIZE });
      await waitFor(() => expect(listedTitles()).toEqual(["Recipe 3"]));
      expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    });

    it("keeps the loaded recipes and offers Try again when the next page fails", async () => {
      await show();
      await screen.findByText("Recipe 1");
      respond = () => ({ status: 503, data: "down" });

      await fireEvent.press(await screen.findByRole("button", { name: "Show more" }));

      expect(await screen.findByText("Couldn't load more recipes.")).toBeTruthy();
      expect(screen.getByText("Recipe 1")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
      expect(screen.queryByText(/Couldn't update the list/)).toBeNull();
    });
  });

  describe("offline", () => {
    const VERSION = { id: "v1", ingredients: [], steps: [{ id: "s1", position: 0, instruction: "Stir." }] } as unknown as VersionResponse;
    const OFFLINE: Respond = () => {
      throw new Error("Network Error");
    };

    it("lists the recipes saved for cooking, newest first, and opens one in cook mode", async () => {
      const now = jest.spyOn(Date, "now");
      now.mockReturnValue(1_000);
      saveCookCopy("r1", "Tomato soup", VERSION);
      now.mockReturnValue(2_000);
      saveCookCopy("r2", "Pancakes", VERSION);
      now.mockRestore();
      respond = OFFLINE;
      await show(SIGNED_IN);

      expect(await screen.findByText("Can't load recipes")).toBeTruthy();
      expect(screen.getByRole("header", { name: "Saved for cooking offline" })).toBeTruthy();
      const buttons = screen.getAllByRole("button", { name: /^Cook / });
      expect(buttons.map((button) => button.props.accessibilityLabel)).toEqual(["Cook Pancakes", "Cook Tomato soup"]);

      await fireEvent.press(screen.getByRole("button", { name: "Cook Tomato soup" }));
      expect(mockPush).toHaveBeenCalledWith({ pathname: "/recipes/[id]/cook", params: { id: "r1" } });
    });

    it("lists nothing saved when nothing was saved", async () => {
      respond = OFFLINE;
      await show(SIGNED_IN);
      expect(await screen.findByText("Can't load recipes")).toBeTruthy();
      expect(screen.queryByText("Saved for cooking offline")).toBeNull();
    });

    it("doesn't list saved copies when the server answered with an error", async () => {
      saveCookCopy("r1", "Tomato soup", VERSION);
      respond = () => ({ status: 500, data: {} });
      await show(SIGNED_IN);
      expect(await screen.findByText("Can't load recipes")).toBeTruthy();
      expect(screen.queryByText("Saved for cooking offline")).toBeNull();
    });
  });
});
