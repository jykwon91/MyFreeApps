import api from "@platform/core/lib/api";
import { baseApi } from "@platform/core/store/baseApi";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { Provider } from "react-redux";
import VersionDiffScreen from "../src/features/versions/VersionDiffScreen";
import { makeStore } from "../src/lib/store";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
let mockParams: { id: string; vid: string; against?: string; from?: string };
let mockScreenOptions: { title?: string; headerBackTitle?: string } | undefined;
jest.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options?: { title?: string; headerBackTitle?: string } }) => {
      mockScreenOptions = options;
      return null;
    },
  },
  router: {
    back: () => mockBack(),
    canGoBack: () => mockCanGoBack,
    replace: (target: unknown) => mockReplace(target),
  },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, canGoBack: () => mockCanGoBack, push: mockPush, replace: mockReplace }),
}));

const SALT = { name: "salt", quantity: 1, unit: "tsp", note: null };
const DIFF = {
  from_version_id: "v1",
  from_version_number: 1,
  to_version_id: "v3",
  to_version_number: 3,
  ingredient_changes: [
    { lineage_key: "lk-salt", change: "changed", before: SALT, after: { ...SALT, quantity: 2 } },
    { lineage_key: "lk-basil", change: "added", before: null, after: { name: "basil", quantity: null, unit: null, note: "torn" } },
  ],
  step_changes: [{ position: 2, change: "removed", before: "Stir often.", after: null }],
};
const RECIPE = { id: "r1", title: "Tomato soup", is_owner: false, latest_version: null };

type Reply = { status: number; data: unknown } | "offline";
let diffReply: Reply;
let recipeReply: Reply;
let gate: Promise<void> = Promise.resolve();
let diffRequests: InternalAxiosRequestConfig[];
let store: ReturnType<typeof makeStore>;

const adapter: AxiosAdapter = async (config) => {
  const isDiff = config.url?.endsWith("/diff") ?? false;
  if (isDiff) {
    diffRequests.push(config);
    await gate;
  }
  const reply = isDiff ? diffReply : recipeReply;
  if (reply === "offline") throw Object.assign(new Error("Network Error"), { config });
  const { status, data } = reply;
  if (status >= 400) throw Object.assign(new Error("failed"), { response: { status, data }, config });
  return { status, data, statusText: "", headers: {}, config };
};

function show() {
  store = makeStore();
  return render(
    <Provider store={store}>
      <VersionDiffScreen />
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

beforeEach(() => {
  api.defaults.adapter = adapter;
  mockCanGoBack = true;
  mockParams = { id: "r1", vid: "v3", against: "v1", from: "versions" };
  mockScreenOptions = undefined;
  gate = Promise.resolve();
  diffRequests = [];
  diffReply = { status: 200, data: DIFF };
  recipeReply = { status: 200, data: RECIPE };
});

afterEach(async () => {
  jest.clearAllMocks();
  await act(async () => {
    store.dispatch(baseApi.util.resetApiState());
  });
});

describe("VersionDiffScreen", () => {
  it("asks for the picked pair, and heads the diff with what changed", async () => {
    await show();

    expect(await screen.findByRole("header", { name: "v1 to v3" })).toBeTruthy();
    expect(screen.getByText("3 changes — 2 ingredient, 1 step.")).toBeTruthy();
    expect(diffRequests[0]?.url).toBe("/recipes/r1/versions/v3/diff");
    expect(diffRequests[0]?.params).toEqual({ against: "v1" });
    expect(mockScreenOptions).toEqual({ title: "Changes", headerBackTitle: "Versions" });
  });

  it("diffs against the parent, which may not be the version numbered before, and names Back for a link", async () => {
    // v3 was a tweak of v1 (or a restore of it), so its parent is v1, not v2, and the header says so.
    mockParams = { id: "r1", vid: "v3" };
    await show();

    await screen.findByRole("header", { name: "v1 to v3" });
    expect(diffRequests[0]?.params).toBeUndefined();
    expect(mockScreenOptions?.headerBackTitle).toBe("Recipes");
  });

  it("shows each change with its symbol and word, not colour alone", async () => {
    await show();
    await screen.findByRole("header", { name: "v1 to v3" });

    expect(screen.getByRole("header", { name: "Ingredients" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Steps" })).toBeTruthy();
    expect(screen.getByText("~ Changed")).toBeTruthy();
    expect(screen.getByText("+ Added")).toBeTruthy();
    expect(screen.getByText("− Removed")).toBeTruthy();
    expect(screen.getByLabelText("Changed: 1 tsp salt to 2 tsp salt").props.accessible).toBe(true);
    expect(screen.getByLabelText("Added: basil (torn)")).toBeTruthy();
    expect(screen.getByLabelText("Removed: Stir often.")).toBeTruthy();
    expect(screen.getByText("1 tsp salt").props.style.textDecorationLine).toBe("line-through");
    expect(screen.getByText("2 tsp salt")).toBeTruthy();
  });

  it("says when a section has no changes", async () => {
    diffReply = { status: 200, data: { ...DIFF, step_changes: [] } };
    await show();

    expect(await screen.findByText("No step changes.")).toBeTruthy();
    expect(screen.getByText("2 changes — 2 ingredient, 0 step.")).toBeTruthy();
  });

  it("calls two versions with no differences identical", async () => {
    diffReply = { status: 200, data: { ...DIFF, ingredient_changes: [], step_changes: [] } };
    await show();

    expect(await screen.findByRole("header", { name: "Identical" })).toBeTruthy();
    expect(screen.getByText("No differences between these versions.")).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Ingredients" })).toBeNull();
  });

  it("compares the first version against nothing, with everything added", async () => {
    mockParams = { id: "r1", vid: "v1" };
    diffReply = {
      status: 200,
      data: {
        ...DIFF,
        from_version_id: null,
        from_version_number: null,
        to_version_id: "v1",
        to_version_number: 1,
        ingredient_changes: [{ lineage_key: "lk-salt", change: "added", before: null, after: SALT }],
        step_changes: [{ position: 1, change: "added", before: null, after: "Stir." }],
      },
    };
    await show();

    expect(await screen.findByRole("header", { name: "nothing to v1" })).toBeTruthy();
    expect(screen.getAllByText("+ Added")).toHaveLength(2);
  });

  it("shows the header and both sections as placeholders while loading", async () => {
    const open = holdResponses();
    await show();

    expect(screen.getByLabelText("Loading comparison")).toBeTruthy();
    expect(screen.getAllByTestId("diff-skeleton-section")).toHaveLength(2);
    expect(screen.queryByTestId("diff-skeleton-tweak", { includeHiddenElements: true })).toBeNull();
    await act(async () => open());
    expect(await screen.findByRole("header", { name: "v1 to v3" })).toBeTruthy();
    expect(screen.queryByLabelText("Loading comparison")).toBeNull();
  });

  it.each([
    [400, "One of these versions isn't part of this recipe, or no longer exists. Go back and pick two versions to compare."],
    [404, "This recipe or one of its versions no longer exists."],
    [422, "This link isn't valid. Go back and pick two versions to compare."],
  ])("says why on a %i, and goes back", async (status, message) => {
    diffReply = { status, data: { detail: "no" } };
    await show();

    expect(await screen.findByRole("header", { name: "Couldn't load this comparison" })).toBeTruthy();
    expect(screen.getByText(message)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("says why when the comparison can't load, and opens the recipe when there's nothing to go back to", async () => {
    mockCanGoBack = false;
    diffReply = "offline";
    await show();

    expect(await screen.findByText("One of these versions may not exist. Go back and pick two versions to compare.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/recipes/[id]", params: { id: "r1" } });
  });

  it("tries again on a pull, and keeps the diff with a notice when that fails", async () => {
    diffReply = "offline";
    await show();
    await screen.findByText("Couldn't load this comparison");

    diffReply = { status: 200, data: DIFF };
    await act(async () => {
      await screen.getByTestId("version-diff").props.refreshControl.props.onRefresh();
    });
    expect(screen.getByRole("header", { name: "v1 to v3" })).toBeTruthy();

    diffReply = "offline";
    await act(async () => {
      await screen.getByTestId("version-diff").props.refreshControl.props.onRefresh();
    });
    expect(screen.getByText("Couldn't update this comparison. Check your connection and try again.")).toBeTruthy();
    expect(screen.getByRole("header", { name: "v1 to v3" })).toBeTruthy();
  });

  it("offers its owner a tweak, which knows it was opened from the diff", async () => {
    recipeReply = { status: 200, data: { ...RECIPE, is_owner: true } };
    await show();

    await fireEvent.press(await screen.findByRole("button", { name: "Tweak this recipe" }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/recipes/[id]/tweak", params: { id: "r1", from: "diff" } });
  });

  it("holds the owner's Tweak button's place while loading", async () => {
    recipeReply = { status: 200, data: { ...RECIPE, is_owner: true } };
    const open = holdResponses();
    await show();

    expect(await screen.findByTestId("diff-skeleton-tweak", { includeHiddenElements: true })).toBeTruthy();
    await act(async () => open());
    expect(await screen.findByRole("button", { name: "Tweak this recipe" })).toBeTruthy();
  });

  it("doesn't offer a tweak to anyone else", async () => {
    await show();
    await screen.findByRole("header", { name: "v1 to v3" });
    expect(screen.queryByRole("button", { name: "Tweak this recipe" })).toBeNull();
  });
});
