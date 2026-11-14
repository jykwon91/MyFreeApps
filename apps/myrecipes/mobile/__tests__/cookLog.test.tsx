import { COOK_LOG_MESSAGES as SHARED, COOK_NOTES_MAX_LENGTH } from "@myrecipes/api-client/constants/cookLog";
import type { CookLogResponse } from "@myrecipes/api-client/types/recipe/cook-log";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import { baseApi } from "@platform/core/store/baseApi";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import { ToastProvider } from "@platform/mobile";
import { alertButton } from "@platform/mobile/test-support/alertButton";
import { serve } from "@platform/mobile/test-support/fakeServer";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { COOK_LOG_PHONE_MESSAGES as MESSAGES } from "../src/constants/cookLog";
import RecipeDetailScreen from "../src/features/recipes/RecipeDetailScreen";
import { makeStore } from "../src/lib/store";
import { formatVersionDate } from "../src/utils/formatVersionDate";

jest.mock("expo-router", () => ({
  router: { dismissTo: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => ({ id: "r1" }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() }),
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

const SOUP: RecipeDetailResponse = {
  id: "r1",
  title: "Tomato soup",
  description: null,
  source: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  version_count: 2,
  latest_version_number: 2,
  is_owner: true,
  owner_display_name: "Sam",
  best_rating: null,
  last_cooked_at: null,
  latest_version: {
    id: "v2",
    recipe_id: "r1",
    version_number: 2,
    parent_version_id: "v1",
    change_note: "More garlic",
    servings: "4",
    prep_minutes: 10,
    cook_minutes: 20,
    created_at: "2026-11-02T00:00:00Z",
    ingredients: [{ id: "i1", lineage_key: "lk-1", position: 0, name: "tomatoes", quantity: 2, unit: "cans", note: null }],
    steps: [{ id: "s1", position: 0, instruction: "Simmer." }],
  },
};

const VERSIONS = [
  { id: "v1", version_number: 1, parent_version_id: null, change_note: null, created_at: "2026-11-01T00:00:00Z", cook_count: 1, best_rating: 3 },
  { id: "v2", version_number: 2, parent_version_id: "v1", change_note: "More garlic", created_at: "2026-11-02T00:00:00Z", cook_count: 1, best_rating: 5 },
];

const OLDER: CookLogResponse = {
  id: "c1",
  version_id: "v1",
  cooked_at: "2026-11-03T18:00:00Z",
  rating: 3,
  outcome_notes: "Too salty.",
  created_at: "2026-11-03T18:00:00Z",
};
const NEWER: CookLogResponse = {
  id: "c2",
  version_id: "v2",
  cooked_at: "2026-11-09T18:00:00Z",
  rating: null,
  outcome_notes: null,
  created_at: "2026-11-09T18:00:00Z",
};

const reply = (status: number, data: unknown = {}): FakeReply => ({ status, data });

let sent: SentRequest[];
let store: ReturnType<typeof makeStore>;

const posts = () => sent.filter(({ route }) => route === "POST /recipes/r1/versions/v2/cooks");
const loads = (route: string) => sent.filter((request) => request.route === route).length;

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
    "GET /recipes/r1/versions": () => reply(200, VERSIONS),
    "GET /recipes/r1/cooks": () => reply(200, []),
    ...routes,
  });
  store = makeStore();
  await render(
    <Provider store={store}>
      <ToastProvider bottomOffset={0}>
        <RecipeDetailScreen />
      </ToastProvider>
    </Provider>,
  );
  await screen.findByText("Simmer.");
}

async function openLog() {
  await fireEvent.press(screen.getByRole("button", { name: SHARED.madeIt }));
  expect(screen.getByRole("header", { name: SHARED.logTitle })).toBeTruthy();
}

const notesField = () => screen.getByLabelText(`${SHARED.notesLabel} ${SHARED.notesOptional}`);
const saveButton = () => screen.getByRole("button", { name: SHARED.save });

beforeEach(() => alert.mockClear());

afterEach(async () => {
  await act(async () => {
    store.dispatch(baseApi.util.resetApiState());
  });
});

describe("the cook log on the recipe screen", () => {
  it("lists every cook newest first, with its date, version, stars and notes", async () => {
    await show({ "GET /recipes/r1/cooks": () => reply(200, [OLDER, NEWER]) });

    const rows = await screen.findAllByTestId(/^cook-c/);
    expect(rows.map((row) => row.props.testID)).toEqual(["cook-c2", "cook-c1"]);
    expect(screen.getByText(formatVersionDate(OLDER.cooked_at))).toBeTruthy();
    expect(await screen.findByText("v1")).toBeTruthy();
    expect(screen.getByText("v2")).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.rated(3))).toBeTruthy();
    expect(screen.getByLabelText("No rating")).toBeTruthy();
    expect(screen.getByText("Too salty.")).toBeTruthy();
  });

  it("doesn't say which version on a recipe with only one, and doesn't ask for its versions", async () => {
    await show({ "GET /recipes/r1/cooks": () => reply(200, [{ ...NEWER, version_id: "v1" }]) }, { ...SOUP, version_count: 1 });

    await screen.findByTestId("cook-c2");
    expect(screen.queryByText("v1")).toBeNull();
    expect(loads("GET /recipes/r1/versions")).toBe(0);
  });

  it("shows loading rows shaped like the cook rows until the log arrives", async () => {
    const cooks = held();
    await show({ "GET /recipes/r1/cooks": cooks.route });

    expect(screen.getByLabelText(MESSAGES.loading)).toBeTruthy();
    expect(screen.getAllByTestId("cook-skeleton-row")).toHaveLength(2);

    await cooks.answer(reply(200, [OLDER]));
    expect(await screen.findByTestId("cook-c1")).toBeTruthy();
    expect(screen.queryByTestId("cook-skeleton-row")).toBeNull();
  });

  it("says when nothing has been logged yet", async () => {
    await show();

    expect(await screen.findByText(SHARED.empty)).toBeTruthy();
    expect(screen.queryByTestId(/^cook-c/)).toBeNull();
  });

  it("says when the log can't load, and can try again", async () => {
    let fail = true;
    await show({ "GET /recipes/r1/cooks": () => (fail ? reply(500) : reply(200, [OLDER])) });

    expect(await screen.findByRole("alert", { name: MESSAGES.loadFailed })).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.tryAgain }));
    expect(await screen.findByTestId("cook-c1")).toBeTruthy();
  });

  it("isn't shown on someone else's recipe, and isn't asked for", async () => {
    await show({}, { ...SOUP, is_owner: false, best_rating: null, last_cooked_at: null });

    expect(screen.queryByRole("button", { name: SHARED.madeIt })).toBeNull();
    expect(screen.queryByRole("header", { name: SHARED.historyTitle })).toBeNull();
    expect(loads("GET /recipes/r1/cooks")).toBe(0);
  });
});

describe("logging a cook", () => {
  it("offers a full-size I made it button with a hint, and a radio button per star", async () => {
    await show();
    const madeIt = screen.getByRole("button", { name: SHARED.madeIt });
    expect(madeIt.props.accessibilityHint).toBe(MESSAGES.madeItHint);

    await openLog();
    expect(screen.getByText(SHARED.logIntro(2))).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("logs the rating and trimmed notes against the version on screen, says so, and refreshes the log and recipe", async () => {
    let cooks: CookLogResponse[] = [];
    const logged: CookLogResponse = { ...NEWER, id: "c9", rating: 4, outcome_notes: "Needs salt" };
    await show({
      "GET /recipes/r1/cooks": () => reply(200, cooks),
      "POST /recipes/r1/versions/v2/cooks": () => {
        cooks = [logged];
        return reply(201, logged);
      },
    });
    await screen.findByText(SHARED.empty);
    const recipeLoads = loads("GET /recipes/r1");

    await openLog();
    await fireEvent.press(screen.getByRole("radio", { name: SHARED.starLabel(4) }));
    expect(screen.getByRole("radio", { name: SHARED.starLabel(4) }).props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.changeText(notesField(), "  Needs salt ");
    await fireEvent.press(saveButton());

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toEqual({ rating: 4, outcome_notes: "Needs salt" });
    expect(await screen.findByRole("alert", { name: SHARED.logged })).toBeTruthy();
    expect(screen.queryByRole("header", { name: SHARED.logTitle })).toBeNull();
    expect(await screen.findByTestId("cook-c9")).toBeTruthy();
    // The recipe's best rating and last cooked come back fresh.
    await waitFor(() => expect(loads("GET /recipes/r1")).toBeGreaterThan(recipeLoads));
  });

  it("logs a cook with no rating and no notes, as the website allows", async () => {
    await show({ "POST /recipes/r1/versions/v2/cooks": () => reply(201, NEWER) });
    await openLog();
    await fireEvent.press(saveButton());

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toEqual({ rating: null, outcome_notes: null });
  });

  it("shows the save in flight on its button and holds the sheet", async () => {
    const post = held();
    await show({ "POST /recipes/r1/versions/v2/cooks": post.route });
    await openLog();
    await fireEvent.press(saveButton());

    const busy = screen.getByRole("button", { name: MESSAGES.saving });
    expect(busy.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(screen.getByRole("button", { name: MESSAGES.cancel }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(notesField().props.editable).toBe(false);
    await fireEvent.press(busy);
    expect(posts()).toHaveLength(1);
    await post.answer(reply(201, NEWER));
  });

  it("says notes are too long as they're typed, and won't save them", async () => {
    const long = "n".repeat(COOK_NOTES_MAX_LENGTH + 1);
    await show({ "POST /recipes/r1/versions/v2/cooks": () => reply(201, NEWER) });
    await openLog();
    await fireEvent.changeText(notesField(), long);

    const problem = tooLongProblem(long, COOK_NOTES_MAX_LENGTH) ?? "";
    expect(screen.getByText(problem)).toBeTruthy();
    expect(notesField().props.accessibilityHint).toBe(problem);
    await fireEvent.press(saveButton());
    expect(posts()).toHaveLength(0);
  });

  it("keeps what was entered when the save fails, says so in the sheet, and can try again", async () => {
    let fail = true;
    await show({ "POST /recipes/r1/versions/v2/cooks": () => (fail ? reply(500) : reply(201, NEWER)) });
    await openLog();
    await fireEvent.press(screen.getByRole("radio", { name: SHARED.starLabel(2) }));
    await fireEvent.changeText(notesField(), "Burnt");
    await fireEvent.press(saveButton());

    expect(await screen.findByRole("alert", { name: SHARED.couldntLog })).toBeTruthy();
    expect(notesField().props.value).toBe("Burnt");
    expect(screen.getByRole("radio", { name: SHARED.starLabel(2) }).props.accessibilityState).toMatchObject({ checked: true });

    fail = false;
    await fireEvent.press(saveButton());
    expect(await screen.findByRole("alert", { name: SHARED.logged })).toBeTruthy();
    expect(posts()).toHaveLength(2);
  });

  it("closes on Cancel without logging", async () => {
    await show();
    await openLog();
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.cancel }));

    expect(screen.queryByRole("header", { name: SHARED.logTitle })).toBeNull();
    expect(posts()).toHaveLength(0);
  });
});

describe("deleting a cook", () => {
  const deleteButton = () => screen.getByRole("button", { name: MESSAGES.deleteRowLabel(formatVersionDate(OLDER.cooked_at)) });
  const deletes = () => sent.filter(({ route }) => route === "DELETE /recipes/r1/cooks/c1");

  it("is a full-size button named for its cook, and asks first; Cancel deletes nothing", async () => {
    await show({ "GET /recipes/r1/cooks": () => reply(200, [OLDER]), "DELETE /recipes/r1/cooks/c1": () => reply(204, null) });
    await screen.findByTestId("cook-c1");
    expect(deleteButton().props.accessibilityHint).toBe(MESSAGES.deleteHint);

    await fireEvent.press(deleteButton());
    expect(alert).toHaveBeenCalledWith(SHARED.deleteTitle, SHARED.deleteBody, [
      { text: MESSAGES.cancel, style: "cancel" },
      { text: SHARED.deleteConfirm, style: "destructive", onPress: expect.any(Function) },
    ]);
    expect(alertButton(MESSAGES.cancel).onPress).toBeUndefined();
    expect(deletes()).toHaveLength(0);
  });

  it("deletes on confirm, shows it in flight, says so, and refreshes the log and the recipe", async () => {
    let cooks = [OLDER];
    const remove = held();
    await show({
      "GET /recipes/r1/cooks": () => reply(200, cooks),
      "DELETE /recipes/r1/cooks/c1": () => {
        cooks = [];
        return remove.route();
      },
    });
    await screen.findByTestId("cook-c1");
    const recipeLoads = loads("GET /recipes/r1");

    await fireEvent.press(deleteButton());
    await act(async () => alertButton(SHARED.deleteConfirm).onPress?.());
    expect(deleteButton().props.accessibilityState).toMatchObject({ busy: true, disabled: true });

    await remove.answer(reply(204, null));
    expect(await screen.findByRole("alert", { name: SHARED.deleted })).toBeTruthy();
    expect(await screen.findByText(SHARED.empty)).toBeTruthy();
    expect(deletes()).toHaveLength(1);
    await waitFor(() => expect(loads("GET /recipes/r1")).toBeGreaterThan(recipeLoads));
  });

  it("keeps the cook and says so when the delete fails, and can try again", async () => {
    await show({ "GET /recipes/r1/cooks": () => reply(200, [OLDER]), "DELETE /recipes/r1/cooks/c1": () => reply(500) });
    await screen.findByTestId("cook-c1");

    await fireEvent.press(deleteButton());
    await act(async () => alertButton(SHARED.deleteConfirm).onPress?.());

    expect(await screen.findByRole("alert", { name: SHARED.couldntDelete })).toBeTruthy();
    expect(screen.getByTestId("cook-c1")).toBeTruthy();
    expect(deleteButton().props.accessibilityState).toMatchObject({ busy: false, disabled: false });
  });
});
