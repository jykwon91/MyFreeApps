import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter } from "axios";
import { Provider } from "react-redux";
import VersionHistoryScreen from "../src/features/versions/VersionHistoryScreen";
import { makeStore } from "../src/lib/store";
import { diffBackTitle } from "../src/utils/diffBackTitle";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockFocus = new Set<() => void>();
jest.mock("expo-router", () => ({
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
  useLocalSearchParams: () => ({ id: "r1" }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, push: mockPush, replace: mockReplace }),
}));

function version(n: number, patch: Record<string, unknown> = {}) {
  return {
    id: `v${n}`,
    version_number: n,
    change_note: n === 1 ? null : `Change ${n}`,
    created_at: `2026-11-0${n}T12:00:00Z`,
    cook_count: null,
    best_rating: null,
    ...patch,
  };
}

// The API lists versions oldest first.
const VERSIONS = [version(1), version(2), version(3)];
const OWNER_VERSIONS = [version(1, { cook_count: 0 }), version(2, { cook_count: 1, best_rating: 3 }), version(3, { cook_count: 2, best_rating: 4 })];

type Reply = { status: number; data: unknown } | "offline";
let reply: Reply;
let gate: Promise<void> = Promise.resolve();
let store: ReturnType<typeof makeStore>;

const adapter: AxiosAdapter = async (config) => {
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
      <VersionHistoryScreen />
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
    await screen.getByTestId("version-list").props.refreshControl.props.onRefresh();
  });
}

function row(id: string) {
  return screen.getByTestId(`version-${id}`);
}

function rowIds(): string[] {
  return screen.getAllByTestId(/^version-v\d+$/).map((node) => node.props.testID);
}

beforeEach(() => {
  api.defaults.adapter = adapter;
  gate = Promise.resolve();
  reply = { status: 200, data: VERSIONS };
});

afterEach(async () => {
  jest.clearAllMocks();
  await act(async () => {
    store.dispatch(baseApi.util.resetApiState());
  });
});

describe("VersionHistoryScreen", () => {
  it("lists versions newest first, marking the latest and saying why v1 has no note", async () => {
    await show();
    await screen.findByTestId("version-v3");

    expect(rowIds()).toEqual(["version-v3", "version-v2", "version-v1"]);
    expect(row("v3").props.accessibilityLabel).toBe("v3, latest, Change 3, Nov 3, 2026");
    expect(row("v1").props.accessibilityLabel).toBe("v1, Original recipe, Nov 1, 2026");
    expect(screen.getAllByText("latest")).toHaveLength(1);
  });

  it("leaves out cooks and ratings for someone else's recipe, and shows them to the owner", async () => {
    await show();
    await screen.findByTestId("version-v3");
    expect(screen.getByText("Nov 3, 2026")).toBeTruthy();
    expect(screen.queryByText(/cook/)).toBeNull();
    expect(screen.queryByText(/Best/)).toBeNull();

    reply = { status: 200, data: OWNER_VERSIONS };
    await pullToRefresh();
    expect(screen.getByText("Nov 3, 2026 · 2 cooks · Best 4/5")).toBeTruthy();
    expect(screen.getByText("Nov 1, 2026 · 0 cooks")).toBeTruthy();
    expect(row("v2").props.accessibilityLabel).toBe("v2, Change 2, Nov 2, 2026, 1 cook, best rating 3 out of 5");
  });

  it("opens a version's changes from its parent, once for a double tap, but not v1's", async () => {
    await show();
    await screen.findByTestId("version-v2");

    expect(row("v2").props.accessibilityRole).toBe("button");
    expect(row("v2").props.accessibilityHint).toBe("Shows what changed from the version it was based on.");
    await fireEvent.press(row("v2"));
    await fireEvent.press(row("v2"));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/recipes/[id]/versions/[vid]/diff",
      params: { id: "r1", vid: "v2", from: "versions" },
    });

    await act(async () => mockFocus.forEach((callback) => callback()));
    expect(row("v1").props.accessibilityRole).toBeUndefined();
    await fireEvent.press(row("v1"));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("compares two picked versions, newer against older, and won't pick a third", async () => {
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: "Compare versions" }));

    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Pick two versions to compare (0 of 2).")).toBeTruthy();
    expect(row("v1").props.accessibilityRole).toBe("checkbox");

    await fireEvent.press(row("v1"));
    await fireEvent.press(row("v3"));
    expect(row("v1").props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(row("v3").props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(row("v2").props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(screen.getByText("Pick two versions to compare (2 of 2).")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();

    await fireEvent.press(row("v2"));
    expect(row("v2").props.accessibilityState.checked).toBe(false);

    await fireEvent.press(screen.getByRole("button", { name: "Compare" }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/recipes/[id]/versions/[vid]/diff",
      params: { id: "r1", vid: "v3", against: "v1", from: "versions" },
    });
  });

  it("unpicks a version, and cancelling clears the picks", async () => {
    await show();
    await fireEvent.press(await screen.findByRole("button", { name: "Compare versions" }));
    await fireEvent.press(row("v2"));
    await fireEvent.press(row("v2"));
    expect(row("v2").props.accessibilityState.checked).toBe(false);

    await fireEvent.press(row("v2"));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Compare versions" })).toBeTruthy();
    expect(row("v2").props.accessibilityRole).toBe("button");
    expect(row("v2").props.accessibilityHint).toBe("Shows what changed from the version it was based on.");

    await fireEvent.press(screen.getByRole("button", { name: "Compare versions" }));
    expect(row("v2").props.accessibilityState.checked).toBe(false);
  });

  it("doesn't offer a comparison with only one version", async () => {
    reply = { status: 200, data: [version(1)] };
    await show();
    await screen.findByTestId("version-v1");
    expect(screen.queryByRole("button", { name: "Compare versions" })).toBeNull();
  });

  it("shows rows of placeholders while loading", async () => {
    const open = holdResponses();
    await show();

    expect(screen.getByLabelText("Loading versions")).toBeTruthy();
    expect(screen.getAllByTestId("version-skeleton-row")).toHaveLength(4);
    expect(screen.getByTestId("compare-bar-skeleton", { includeHiddenElements: true })).toBeTruthy();
    await act(async () => open());
    expect(await screen.findByTestId("version-v3")).toBeTruthy();
    expect(screen.queryByTestId("compare-bar-skeleton", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByRole("button", { name: "Compare versions" })).toBeTruthy();
    expect(screen.queryByLabelText("Loading versions")).toBeNull();
  });

  it("says when the list can't load, and tries again", async () => {
    reply = "offline";
    await show();

    expect(await screen.findByText("Can't load versions")).toBeTruthy();
    reply = { status: 200, data: VERSIONS };
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("version-v3")).toBeTruthy();
  });

  it("says the recipe is gone on a 404 and goes back to recipes", async () => {
    reply = { status: 404, data: { detail: "Recipe not found" } };
    await show();

    expect(await screen.findByText("Recipe not found")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back to recipes" }));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("refreshes on a pull, and keeps the rows with a notice when that fails", async () => {
    await show();
    await screen.findByTestId("version-v3");

    reply = { status: 200, data: [...VERSIONS, version(4)] };
    await pullToRefresh();
    expect(rowIds()[0]).toBe("version-v4");

    reply = "offline";
    await pullToRefresh();
    expect(screen.getByText("Couldn't update the versions. Check your connection and try again.")).toBeTruthy();
    expect(rowIds()).toHaveLength(4);
  });
});

describe("diffBackTitle", () => {
  it("names Back for where the diff was opened, and Recipes for a link", () => {
    expect(diffBackTitle("versions")).toBe("Versions");
    expect(diffBackTitle(undefined)).toBe("Recipes");
    expect(diffBackTitle("constructor")).toBe("Recipes");
  });
});
