import { COOK_LOG_MESSAGES as SHARED } from "@myrecipes/api-client/constants/cookLog";
import type { CookLogResponse } from "@myrecipes/api-client/types/recipe/cook-log";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { VersionResponse, VersionSummary } from "@myrecipes/api-client/types/recipe/version";
import { baseApi } from "@platform/core/store/baseApi";
import { ToastProvider } from "@platform/mobile";
import { serve } from "@platform/mobile/test-support/fakeServer";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { COOK_LOG_PHONE_MESSAGES as COOK_MESSAGES } from "../src/constants/cookLog";
import { VERSION_VIEW_MESSAGES as MESSAGES } from "../src/constants/versions";
import VersionScreen from "../src/features/versions/VersionScreen";
import { makeStore } from "../src/lib/store";
import { formatVersionDate } from "../src/utils/formatVersionDate";

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams = { id: "r1", vid: "v1" };
jest.mock("expo-router", () => ({
  router: { canGoBack: () => true, back: (...args: unknown[]) => mockBack(...args), replace: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, push: mockPush, replace: jest.fn() }),
}));

function version(n: number, patch: Partial<VersionResponse> = {}): VersionResponse {
  return {
    id: `v${n}`,
    recipe_id: "r1",
    version_number: n,
    parent_version_id: n === 1 ? null : `v${n - 1}`,
    change_note: n === 1 ? null : `Change ${n}`,
    servings: "4",
    prep_minutes: 10,
    cook_minutes: 20,
    created_at: `2026-11-0${n}T12:00:00Z`,
    ingredients: [{ id: `i${n}`, lineage_key: "lk-1", position: 0, name: "tomatoes", quantity: n, unit: "cans", note: null }],
    steps: [{ id: `s${n}`, position: 0, instruction: `Simmer ${n * 10} minutes.` }],
    ...patch,
  };
}

const V1 = version(1);
const V2 = version(2);
const V3 = version(3);

/** The timeline entry Version history caches: the owner's cooks and best rating. */
function summary(v: VersionResponse, cookCount: number | null, bestRating: number | null): VersionSummary {
  return {
    id: v.id,
    version_number: v.version_number,
    change_note: v.change_note,
    created_at: v.created_at,
    cook_count: cookCount,
    best_rating: bestRating,
  };
}

const TIMELINE = [summary(V1, 1, 3), summary(V2, 0, null), summary(V3, 0, null)];

const SOUP: RecipeDetailResponse = {
  id: "r1",
  title: "Tomato soup",
  description: null,
  source: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-03T00:00:00Z",
  version_count: 3,
  latest_version_number: 3,
  is_owner: true,
  owner_display_name: "Sam",
  best_rating: null,
  last_cooked_at: null,
  latest_version: V3,
};

const COOKED: CookLogResponse = {
  id: "c1",
  version_id: "v1",
  cooked_at: "2026-11-10T18:00:00Z",
  rating: 4,
  outcome_notes: "Better than v3",
  created_at: "2026-11-10T18:00:00Z",
};

const reply = (status: number, data: unknown = {}): FakeReply => ({ status, data });

let sent: SentRequest[];
let store: ReturnType<typeof makeStore>;

const cookPosts = () => sent.filter(({ route }) => /^POST \/recipes\/r1\/versions\/[^/]+\/cooks$/.test(route));

/** Answers once, when the test says so. */
function held() {
  let answer: (value: FakeReply) => void = () => undefined;
  return {
    route: () => new Promise<FakeReply>((resolve) => (answer = resolve)),
    answer: async (value: FakeReply) => act(async () => answer(value)),
  };
}

async function show(routes: Parameters<typeof serve>[0] = {}, recipe: RecipeDetailResponse = SOUP) {
  sent = serve({
    "GET /recipes/r1": () => reply(200, recipe),
    "GET /recipes/r1/versions": () => reply(200, TIMELINE),
    "GET /recipes/r1/versions/v1": () => reply(200, V1),
    "GET /recipes/r1/versions/v2": () => reply(200, V2),
    "GET /recipes/r1/versions/v3": () => reply(200, V3),
    ...routes,
  });
  store = makeStore();
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <VersionScreen />
      </ToastProvider>
    </Provider>,
  );
}

async function pullToRefresh() {
  await act(async () => {
    await screen.getByTestId("version-view").props.refreshControl.props.onRefresh();
  });
}

const madeIt = () => screen.getByRole("button", { name: SHARED.madeIt });
const saveButton = () => screen.getByRole("button", { name: SHARED.save });

beforeEach(() => {
  mockParams = { id: "r1", vid: "v1" };
});

afterEach(async () => {
  jest.clearAllMocks();
  await act(async () => {
    store.dispatch(baseApi.util.resetApiState());
  });
});

describe("a version shown in full", () => {
  it("shows an older version's number, note, date, facts, ingredients and steps, not the latest's", async () => {
    await show();

    expect(await screen.findByRole("header", { name: "v1" })).toBeTruthy();
    expect(screen.getByText("Original recipe")).toBeTruthy();
    const meta = await screen.findByText(`${formatVersionDate(V1.created_at)} · 1 cook · Best 3/5`);
    expect(meta.props.accessibilityLabel).toBe(`${formatVersionDate(V1.created_at)}, 1 cook, best rating 3 out of 5`);
    expect(screen.getByLabelText("Servings: 4")).toBeTruthy();
    expect(screen.getByText("1 cans tomatoes")).toBeTruthy();
    expect(screen.getByLabelText("Step 1. Simmer 10 minutes.")).toBeTruthy();
    expect(screen.queryByText("Simmer 30 minutes.")).toBeNull();
    expect(screen.queryByText("latest")).toBeNull();
    expect(sent.some(({ route }) => route === "GET /recipes/r1/versions/v1")).toBe(true);
  });

  it("marks the latest version", async () => {
    mockParams = { id: "r1", vid: "v3" };
    await show();

    expect(await screen.findByRole("header", { name: "v3" })).toBeTruthy();
    expect(await screen.findByText("latest")).toBeTruthy();
    expect(screen.getByText("Change 3")).toBeTruthy();
  });

  it("opens what changed from the version it was based on, once for a double tap, but not for v1", async () => {
    mockParams = { id: "r1", vid: "v2" };
    await show();
    const changes = await screen.findByRole("button", { name: MESSAGES.changes });
    expect(changes.props.accessibilityHint).toBe(MESSAGES.changesHint);

    await fireEvent.press(changes);
    await fireEvent.press(changes);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/recipes/[id]/versions/[vid]/diff",
      params: { id: "r1", vid: "v2", from: "version" },
    });
  });

  it("has no What changed for the first version", async () => {
    await show();
    await screen.findByRole("header", { name: "v1" });
    expect(screen.queryByRole("button", { name: MESSAGES.changes })).toBeNull();
  });

  it("shows a placeholder shaped like the version while it loads", async () => {
    const load = held();
    mockParams = { id: "r1", vid: "v2" };
    await show({ "GET /recipes/r1/versions/v2": load.route });

    expect(screen.getByLabelText(MESSAGES.loading)).toBeTruthy();
    expect(screen.getAllByTestId("version-skeleton-ingredient", { includeHiddenElements: true })).toHaveLength(5);
    expect(screen.getAllByTestId("version-skeleton-step", { includeHiddenElements: true })).toHaveLength(3);
    // What changed and the owner's I made it, once the recipe says who owns it.
    await waitFor(() => expect(screen.getAllByTestId("version-skeleton-button", { includeHiddenElements: true })).toHaveLength(2));

    await load.answer(reply(200, V2));
    expect(await screen.findByRole("header", { name: "v2" })).toBeTruthy();
    expect(screen.queryByLabelText(MESSAGES.loading)).toBeNull();
    expect(screen.getByRole("button", { name: MESSAGES.changes })).toBeTruthy();
    expect(screen.getByRole("button", { name: SHARED.madeIt })).toBeTruthy();
  });

  it("holds no place for What changed while v1 loads, once the version list says it's v1", async () => {
    const load = held();
    const timeline = held();
    await show({ "GET /recipes/r1/versions/v1": load.route, "GET /recipes/r1/versions": timeline.route });

    // Until the list says which version this is, What changed keeps its place, as most versions have one.
    await waitFor(() => expect(screen.getAllByTestId("version-skeleton-button", { includeHiddenElements: true })).toHaveLength(2));
    await timeline.answer(reply(200, TIMELINE));
    await waitFor(() => expect(screen.getAllByTestId("version-skeleton-button", { includeHiddenElements: true })).toHaveLength(1));

    await load.answer(reply(200, V1));
    expect(await screen.findByRole("header", { name: "v1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: MESSAGES.changes })).toBeNull();
    expect(screen.getByRole("button", { name: SHARED.madeIt })).toBeTruthy();
  });

  it("says when the version can't load, and tries again", async () => {
    let fail = true;
    await show({ "GET /recipes/r1/versions/v1": () => (fail ? reply(500) : reply(200, V1)) });

    expect(await screen.findByText(MESSAGES.loadFailedHeading)).toBeTruthy();
    expect(screen.getByText(MESSAGES.loadFailedBody)).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByRole("header", { name: "v1" })).toBeTruthy();
  });

  it("says the version is gone on a 404 and goes back", async () => {
    await show({ "GET /recipes/r1/versions/v1": () => reply(404, { detail: "Version not found" }) });

    expect(await screen.findByText(MESSAGES.notFoundHeading)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.goBack }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("keeps the version with a notice when a refresh fails", async () => {
    let fail = false;
    await show({ "GET /recipes/r1/versions/v1": () => (fail ? reply(500) : reply(200, V1)) });
    await screen.findByRole("header", { name: "v1" });

    fail = true;
    await pullToRefresh();
    expect(await screen.findByText(MESSAGES.updateFailed)).toBeTruthy();
    expect(screen.getByLabelText("Step 1. Simmer 10 minutes.")).toBeTruthy();
  });

  it("doesn't offer I made it on someone else's recipe, or show its cooks", async () => {
    await show(
      { "GET /recipes/r1/versions": () => reply(200, [summary(V1, null, null), summary(V2, null, null), summary(V3, null, null)]) },
      { ...SOUP, is_owner: false },
    );
    await screen.findByRole("header", { name: "v1" });
    await waitFor(() => expect(sent.some(({ route }) => route === "GET /recipes/r1")).toBe(true));

    expect(screen.queryByRole("button", { name: SHARED.madeIt })).toBeNull();
    expect(screen.getByTestId("version-meta").props.children).toBe(formatVersionDate(V1.created_at));
  });
});

describe("logging a cook of an older version", () => {
  it("logs it against the version on screen, not the latest, and says so", async () => {
    await show({ "POST /recipes/r1/versions/v1/cooks": () => reply(201, COOKED) });
    await screen.findByRole("header", { name: "v1" });

    await fireEvent.press(await screen.findByRole("button", { name: SHARED.madeIt }));
    expect(madeIt().props.accessibilityHint).toBe(COOK_MESSAGES.madeItHint);
    expect(screen.getByText(SHARED.logIntro(1))).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: SHARED.starLabel(4) }));
    await fireEvent.changeText(screen.getByLabelText(`${SHARED.notesLabel} ${SHARED.notesOptional}`), "Better than v3");
    await fireEvent.press(saveButton());

    await waitFor(() => expect(cookPosts()).toHaveLength(1));
    expect(cookPosts()[0].route).toBe("POST /recipes/r1/versions/v1/cooks");
    expect(cookPosts()[0].body).toEqual({ rating: 4, outcome_notes: "Better than v3" });
    expect(await screen.findByRole("alert", { name: SHARED.logged })).toBeTruthy();
    expect(screen.queryByRole("header", { name: SHARED.logTitle })).toBeNull();
  });

  it("refreshes the version's cooks and best rating after logging one, as the website's timeline does", async () => {
    let logged = false;
    await show({
      "GET /recipes/r1/versions": () => reply(200, logged ? [summary(V1, 2, 4), ...TIMELINE.slice(1)] : TIMELINE),
      "POST /recipes/r1/versions/v1/cooks": () => {
        logged = true;
        return reply(201, COOKED);
      },
    });
    expect(await screen.findByText(`${formatVersionDate(V1.created_at)} · 1 cook · Best 3/5`)).toBeTruthy();

    await fireEvent.press(await screen.findByRole("button", { name: SHARED.madeIt }));
    await fireEvent.press(screen.getByRole("radio", { name: SHARED.starLabel(4) }));
    await fireEvent.press(saveButton());

    expect(await screen.findByText(`${formatVersionDate(V1.created_at)} · 2 cooks · Best 4/5`)).toBeTruthy();
    expect(sent.filter(({ route }) => route === "GET /recipes/r1/versions")).toHaveLength(2);
  });

  it("shows the save in flight on its button and won't send it twice", async () => {
    const post = held();
    mockParams = { id: "r1", vid: "v2" };
    await show({ "POST /recipes/r1/versions/v2/cooks": post.route });
    await fireEvent.press(await screen.findByRole("button", { name: SHARED.madeIt }));
    expect(screen.getByText(SHARED.logIntro(2))).toBeTruthy();
    await fireEvent.press(saveButton());

    const busy = screen.getByRole("button", { name: COOK_MESSAGES.saving });
    expect(busy.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(busy);
    expect(cookPosts()).toHaveLength(1);
    expect(cookPosts()[0].route).toBe("POST /recipes/r1/versions/v2/cooks");
    await post.answer(reply(201, { ...COOKED, version_id: "v2" }));
    expect(await screen.findByRole("alert", { name: SHARED.logged })).toBeTruthy();
  });

  it("keeps the sheet open and says so when the save fails", async () => {
    await show({ "POST /recipes/r1/versions/v1/cooks": () => reply(500) });
    await fireEvent.press(await screen.findByRole("button", { name: SHARED.madeIt }));
    await fireEvent.press(saveButton());

    expect(await screen.findByRole("alert", { name: SHARED.couldntLog })).toBeTruthy();
    expect(screen.getByRole("header", { name: SHARED.logTitle })).toBeTruthy();
  });
});
