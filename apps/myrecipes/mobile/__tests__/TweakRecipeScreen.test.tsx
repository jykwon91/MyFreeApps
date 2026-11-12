import { CHANGE_NOTE_MAX_LENGTH, RECIPE_FORM_PROBLEMS as PROBLEMS, RECIPE_SERVINGS_MAX_LENGTH } from "@myrecipes/api-client/constants/recipeForm";
import { TWEAK_MESSAGES } from "@myrecipes/api-client/constants/tweak";
import { recipesApi } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import { DISCARD_MESSAGES, type MobileSession, type SessionState, SessionProvider, ToastProvider } from "@platform/mobile";
import { alertButton } from "@platform/mobile/test-support/alertButton";
import { serve } from "@platform/mobile/test-support/fakeServer";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { SentRequest } from "@platform/mobile/test-support/types/SentRequest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { Provider } from "react-redux";
import { NEW_RECIPE_MESSAGES } from "../src/constants/newRecipe";
import { TWEAK_RECIPE_MESSAGES as MESSAGES } from "../src/constants/tweakRecipe";
import TweakRecipeScreen from "../src/features/tweakRecipe/TweakRecipeScreen";
import { makeStore } from "../src/lib/store";
import { type FakeStack, fakeStack } from "./support/fakeStack";

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRepeat = jest.fn();
// Tabs, then the recipe, then this form; a test opened by a link has only the form.
const ON_RECIPE = [{ name: "(tabs)" }, { name: "recipes/[id]", params: { id: "r1" } }, { name: "recipes/[id]/tweak", params: { id: "r1" } }];
let mockStack: FakeStack;
// What the screen last told the navigator about leaving: whether to stop it, and what to do instead.
const mockGuard: { prevent: boolean; ask: ((event: { repeat: () => void }) => void) | null } = { prevent: false, ask: null };
jest.mock("expo-router", () => ({
  router: {
    back: () => {
      mockBack();
      mockStack.back();
    },
    canGoBack: () => mockStack.canGoBack(),
    dismiss: (count?: number) => mockStack.dismiss(count),
    replace: (href: string) => {
      mockReplace(href);
      mockStack.replace(href);
    },
  },
  useLocalSearchParams: () => ({ id: "r1" }),
  useNavigation: () => ({ getState: () => mockStack.state() }),
  useRouter: () => ({ back: mockBack, canGoBack: () => mockStack.canGoBack(), push: mockPush, replace: mockReplace }),
  usePreventRemove: (prevent: boolean, ask: (event: { repeat: () => void }) => void) => {
    mockGuard.prevent = prevent;
    mockGuard.ask = ask;
  },
}));
jest.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 0 }));
// The device locale's decimal separator; "." unless a test is in a comma-decimal locale.
let mockDecimalSeparator: "." | "," = ".";
jest.mock("../src/utils/deviceDecimalSeparator", () => ({ deviceDecimalSeparator: () => mockDecimalSeparator }));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

const VERSION: VersionResponse = {
  id: "v2",
  recipe_id: "r1",
  version_number: 2,
  parent_version_id: "v1",
  change_note: "Less salt",
  servings: "4",
  prep_minutes: 10,
  cook_minutes: 25,
  created_at: "2026-11-11T00:00:00Z",
  ingredients: [
    { id: "i1", lineage_key: "lk-tomatoes", position: 0, name: "tomatoes", quantity: 2, unit: "cans", note: "crushed" },
    { id: "i2", lineage_key: "lk-salt", position: 1, name: "salt", quantity: 0.5, unit: "tsp", note: null },
  ],
  steps: [{ id: "s1", position: 0, instruction: "Simmer." }],
};

const SOUP: RecipeDetailResponse = {
  id: "r1",
  title: "Tomato soup",
  description: null,
  source: null,
  created_at: "2026-11-11T00:00:00Z",
  updated_at: "2026-11-11T00:00:00Z",
  version_count: 2,
  latest_version_number: 2,
  is_owner: true,
  owner_display_name: "Sam",
  best_rating: null,
  last_cooked_at: null,
  latest_version: VERSION,
};

const SAVED: VersionResponse = { ...VERSION, id: "v3", version_number: 3, parent_version_id: "v2", change_note: "More salt" };

const SAM: SessionState = { status: "signedIn", email: "sam@example.com", sessionId: "s1" };
const ALEX: SessionState = { status: "signedIn", email: "alex@example.com", sessionId: "s2" };

const reply = (status: number, data: unknown = {}): FakeReply => ({ status, data });

/** Answers one by one, in the order they were asked for. */
function held() {
  const answers: ((value: FakeReply) => void)[] = [];
  return {
    route: () => new Promise<FakeReply>((resolve) => answers.push(resolve)),
    answer: async (index: number, value: FakeReply) => act(async () => answers[index](value)),
    count: () => answers.length,
  };
}

/** A session whose account the test can change, as signing out and in again does. */
function fakeSession(initial: SessionState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const session = {
    start: async () => {},
    retryRestore: async () => {},
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

let sent: SentRequest[];
let store: ReturnType<typeof makeStore>;

/** `cached` is a recipe already in the cache from earlier, as the detail screen leaves it. */
async function show(state: SessionState = SAM, cached?: RecipeDetailResponse) {
  const { session, become } = fakeSession(state);
  store = makeStore();
  if (cached) await store.dispatch(recipesApi.util.upsertQueryData("getRecipe", cached.id, cached));
  await render(
    <Provider store={store}>
      <SessionProvider session={session}>
        <ToastProvider bottomOffset={0}>
          <TweakRecipeScreen />
        </ToastProvider>
      </SessionProvider>
    </Provider>,
  );
  return become;
}

/** The form, once the recipe has loaded. */
async function showForm(state: SessionState = SAM) {
  const become = await show(state);
  await screen.findByTestId("tweak-recipe");
  return become;
}

const NOTE = "What did you change?, required";

async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

async function press(name: string) {
  await fireEvent.press(screen.getByRole("button", { name }));
}

/** Back, or a swipe: what the navigator does with the screen's guard. */
async function tryToLeave() {
  await act(async () => {
    if (mockGuard.prevent && mockGuard.ask) mockGuard.ask({ repeat: mockRepeat });
    else mockRepeat();
  });
}

function posts(): SentRequest[] {
  return sent.filter((request) => request.route === "POST /recipes/r1/versions");
}

beforeEach(() => {
  sent = serve({ "GET /recipes/r1": () => reply(200, SOUP), "POST /recipes/r1/versions": () => reply(201, SAVED) });
  mockStack = fakeStack(ON_RECIPE);
  mockDecimalSeparator = ".";
  mockGuard.prevent = false;
  mockGuard.ask = null;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe("signed out", () => {
  it("asks to sign in, as the website does, and loads nothing", async () => {
    await show({ status: "signedOut", endedByServer: false, lastEmail: null });
    expect(screen.getByRole("header", { name: MESSAGES.signInHeading })).toBeTruthy();
    expect(screen.queryByTestId("tweak-recipe")).toBeNull();
    await press(NEW_RECIPE_MESSAGES.signIn);
    expect(mockPush).toHaveBeenCalledWith("/sign-in");
    expect(sent).toHaveLength(0);
  });
});

describe("opening", () => {
  it("shows the form's shape while the recipe loads", async () => {
    const recipe = held();
    sent = serve({ "GET /recipes/r1": recipe.route });
    await show();

    expect(screen.getByTestId("tweak-recipe-skeleton")).toBeTruthy();
    expect(screen.getByLabelText(MESSAGES.loading)).toBeTruthy();
    expect(screen.queryByTestId("tweak-recipe")).toBeNull();

    await waitFor(() => expect(recipe.count()).toBe(1));
    await recipe.answer(0, reply(200, SOUP));
    expect(await screen.findByTestId("tweak-recipe")).toBeTruthy();
    expect(screen.queryByTestId("tweak-recipe-skeleton")).toBeNull();
  });

  it("asks for the recipe again on opening, and starts from that answer, not an older cached one", async () => {
    const OLD: RecipeDetailResponse = {
      ...SOUP,
      latest_version_number: 1,
      latest_version: { ...VERSION, id: "v1", version_number: 1, servings: "2", ingredients: [VERSION.ingredients[0]] },
    };
    const recipe = held();
    sent = serve({ "GET /recipes/r1": recipe.route, "POST /recipes/r1/versions": () => reply(201, SAVED) });
    await show(SAM, OLD);

    // The cached recipe isn't tweaked from while the fresh one is on its way.
    expect(screen.getByTestId("tweak-recipe-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("tweak-recipe")).toBeNull();
    await waitFor(() => expect(recipe.count()).toBe(1));
    await recipe.answer(0, reply(200, SOUP));
    expect((await screen.findByLabelText("Servings")).props.value).toBe("4");
    expect(screen.getByText(MESSAGES.startingFrom(2))).toBeTruthy();

    // A later answer with a newer version doesn't move the form, or the version it starts from.
    const NEWER: RecipeDetailResponse = { ...SOUP, latest_version_number: 3, latest_version: { ...SAVED, servings: "8" } };
    await act(async () => {
      void store.dispatch(recipesApi.endpoints.getRecipe.initiate("r1", { forceRefetch: true }));
    });
    await waitFor(() => expect(recipe.count()).toBe(2));
    await recipe.answer(1, reply(200, NEWER));
    expect(screen.getByLabelText("Servings").props.value).toBe("4");
    expect(screen.getByText(MESSAGES.startingFrom(2))).toBeTruthy();

    await type(NOTE, "More salt");
    await press(MESSAGES.save);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toMatchObject({ base_version_id: "v2", servings: "4" });
  });

  it("starts from the latest version, with the title shown and not editable", async () => {
    await showForm();

    expect(screen.getByRole("header", { name: "Tomato soup" })).toBeTruthy();
    expect(screen.queryByLabelText("Title, required")).toBeNull();
    expect(screen.getByText(MESSAGES.startingFrom(2))).toBeTruthy();
    expect(screen.getByLabelText(NOTE).props.value).toBe("");
    expect(screen.getByLabelText("Servings").props.value).toBe("4");
    expect(screen.getByLabelText("Prep (min)").props.value).toBe("10");
    expect(screen.getByLabelText("Cook (min)").props.value).toBe("25");
    expect(screen.getByLabelText("Ingredient 1").props.value).toBe("tomatoes");
    expect(screen.getByLabelText("Ingredient 1 amount").props.value).toBe("2");
    expect(screen.getByLabelText("Ingredient 1 note").props.value).toBe("crushed");
    expect(screen.getByLabelText("Ingredient 2 amount").props.value).toBe("0.5");
    expect(screen.getByLabelText("Step 1").props.value).toBe("Simmer.");
  });

  it("tells someone else's recipe can't be tweaked, and goes back to it", async () => {
    sent = serve({ "GET /recipes/r1": () => reply(200, { ...SOUP, is_owner: false }) });
    await show();

    expect(await screen.findByText(MESSAGES.notOwnerHeading)).toBeTruthy();
    expect(screen.queryByTestId("tweak-recipe")).toBeNull();
    await press(MESSAGES.backToRecipe);
    expect(mockBack).toHaveBeenCalledTimes(1);

    mockStack = fakeStack([ON_RECIPE[2]]);
    await press(MESSAGES.backToRecipe);
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/recipes/[id]", params: { id: "r1" } });
  });

  it("says a recipe that's gone isn't found", async () => {
    sent = serve({ "GET /recipes/r1": () => reply(404, { detail: "Not Found" }) });
    await show();

    expect(await screen.findByText(MESSAGES.notFoundHeading)).toBeTruthy();
    await press(MESSAGES.backToRecipes);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("says a recipe with no version has nothing to tweak", async () => {
    sent = serve({ "GET /recipes/r1": () => reply(200, { ...SOUP, latest_version: null }) });
    await show();

    expect(await screen.findByText(MESSAGES.notFoundHeading)).toBeTruthy();
    expect(screen.getByText(MESSAGES.notFoundBody)).toBeTruthy();
    expect(screen.queryByTestId("tweak-recipe")).toBeNull();
  });

  it("offers to try again when the recipe can't be loaded", async () => {
    let failing = true;
    sent = serve({ "GET /recipes/r1": () => (failing ? reply(500) : reply(200, SOUP)) });
    await show();

    expect(await screen.findByText(MESSAGES.loadFailedHeading)).toBeTruthy();
    failing = false;
    await press(MESSAGES.tryAgain);
    expect(await screen.findByTestId("tweak-recipe")).toBeTruthy();
  });
});

describe("checking before it saves", () => {
  it("needs a note saying what changed, and sends nothing without one", async () => {
    await showForm();
    expect(screen.queryByText(PROBLEMS.changeNoteRequired)).toBeNull();

    await press(MESSAGES.save);

    // On the note field, and toasted.
    expect(screen.getAllByText(PROBLEMS.changeNoteRequired)).toHaveLength(2);
    expect(posts()).toHaveLength(0);
  });

  it("checks the version's content as the new-recipe form does, before the note", async () => {
    await showForm();
    await type("Ingredient 1 amount", "1/2");
    await type("Cook (min)", "soon");

    await press(MESSAGES.save);

    expect(screen.getByText(PROBLEMS.quantityInvalid("."))).toBeTruthy();
    // On the field, and toasted as the first problem down the form.
    expect(screen.getAllByText(PROBLEMS.minutesInvalid)).toHaveLength(2);
    expect(screen.getAllByText(PROBLEMS.changeNoteRequired)).toHaveLength(1);
    expect(posts()).toHaveLength(0);
  });

  it("holds servings to its limit as it's typed, and won't save past it", async () => {
    await showForm();
    const tooMany = "s".repeat(RECIPE_SERVINGS_MAX_LENGTH + 1);
    await type("Servings", tooMany);

    const tooLong = tooLongProblem(tooMany, RECIPE_SERVINGS_MAX_LENGTH) as string;
    expect(screen.getByText(tooLong)).toBeTruthy();

    await type(NOTE, "More servings");
    await press(MESSAGES.save);
    // On the field, and toasted.
    expect(screen.getAllByText(tooLong)).toHaveLength(2);
    expect(posts()).toHaveLength(0);
  });

  it("counts towards the note's limit, and says straight away when it's over", async () => {
    await showForm();
    await type(NOTE, "n".repeat(CHANGE_NOTE_MAX_LENGTH + 1));

    expect(screen.getByText("2,001 / 2,000", { includeHiddenElements: true })).toBeTruthy();
    const tooLong = tooLongProblem("n".repeat(CHANGE_NOTE_MAX_LENGTH + 1), CHANGE_NOTE_MAX_LENGTH) as string;
    expect(screen.getByText(tooLong)).toBeTruthy();

    await press(MESSAGES.save);
    expect(posts()).toHaveLength(0);
  });
});

describe("saving", () => {
  it("sends the tweak from its base version with every lineage key, then goes back to the recipe", async () => {
    const save = held();
    // The recipe is asked for again once saved; that answer waits, so what shows first is the form's own.
    const reload = held();
    let loads = 0;
    sent = serve({
      "GET /recipes/r1": () => (++loads === 1 ? reply(200, SOUP) : reload.route()),
      "POST /recipes/r1/versions": save.route,
    });
    await showForm();

    await type(NOTE, "  More salt ");
    await type("Servings", "6");
    await type("Ingredient 2 amount", "1");
    await press("Move ingredient 2 up");
    await press(NEW_RECIPE_MESSAGES.addIngredient);
    await type("Ingredient 3", "basil");
    await press(NEW_RECIPE_MESSAGES.addStep);
    await type("Step 2", "Season.");

    await press(MESSAGES.save);
    // Busy from the press, and leaving can't walk away from a save in flight.
    expect(screen.getByText(MESSAGES.saving)).toBeTruthy();
    await tryToLeave();
    expect(alert).not.toHaveBeenCalled();
    expect(mockRepeat).not.toHaveBeenCalled();

    await waitFor(() => expect(save.count()).toBe(1));
    expect(posts()[0].body).toEqual({
      base_version_id: "v2",
      change_note: "More salt",
      servings: "6",
      prep_minutes: 10,
      cook_minutes: 25,
      ingredients: [
        { name: "salt", quantity: 1, unit: "tsp", note: null, lineage_key: "lk-salt" },
        { name: "tomatoes", quantity: 2, unit: "cans", note: "crushed", lineage_key: "lk-tomatoes" },
        { name: "basil", quantity: null, unit: null, note: null, lineage_key: null },
      ],
      steps: [{ instruction: "Simmer." }, { instruction: "Season." }],
    });

    await save.answer(0, reply(201, SAVED));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(screen.getByText(TWEAK_MESSAGES.saved)).toBeTruthy();
    // Leaving for the recipe isn't asked about, and the recipe already shows the new version.
    expect(mockGuard.prevent).toBe(false);
    const cached = store.getState().api.queries['getRecipe("r1")']?.data as RecipeDetailResponse;
    expect(cached.latest_version).toEqual(SAVED);
    expect(cached.latest_version_number).toBe(3);
    expect(cached.version_count).toBe(3);
    await waitFor(() => expect(reload.count()).toBe(1));
    await reload.answer(0, reply(200, { ...cached }));
  });

  it("keeps the other ingredients' lineage keys when one is removed", async () => {
    await showForm();
    await type(NOTE, "No tomatoes");
    await press("Remove ingredient 1");
    expect(screen.getByLabelText("Ingredient 1").props.value).toBe("salt");

    await press(MESSAGES.save);

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body.ingredients).toEqual([{ name: "salt", quantity: 0.5, unit: "tsp", note: null, lineage_key: "lk-salt" }]);
  });

  it("shows and reads amounts in a comma-decimal locale", async () => {
    mockDecimalSeparator = ",";
    await showForm();
    expect(screen.getByLabelText("Ingredient 2 amount").props.value).toBe("0,5");

    await type(NOTE, "More salt");
    await type("Ingredient 2 amount", "0.75");
    await press(MESSAGES.save);
    expect(screen.getAllByText(PROBLEMS.decimalSeparatorHint(","))).toHaveLength(2);
    expect(posts()).toHaveLength(0);

    await type("Ingredient 2 amount", "0,75");
    await type("Prep (min)", "12,4");
    await press(MESSAGES.save);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toMatchObject({
      prep_minutes: 12,
      ingredients: [
        { name: "tomatoes", quantity: 2, unit: "cans", note: "crushed", lineage_key: "lk-tomatoes" },
        { name: "salt", quantity: 0.75, unit: "tsp", note: null, lineage_key: "lk-salt" },
      ],
    });
  });

  it.each([
    [400, TWEAK_MESSAGES.changedOrNotYours],
    [404, TWEAK_MESSAGES.changedOrNotYours],
    [422, TWEAK_MESSAGES.checkEntries],
    [500, TWEAK_MESSAGES.couldntSave],
  ])("says why a %i didn't save, and keeps everything typed to try again", async (status, message) => {
    let failing = true;
    sent = serve({
      "GET /recipes/r1": () => reply(200, SOUP),
      "POST /recipes/r1/versions": () => (failing ? reply(status, { detail: "no" }) : reply(201, SAVED)),
    });
    await showForm();
    await type(NOTE, "More salt");

    await press(MESSAGES.save);

    expect(await screen.findByText(message)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByLabelText(NOTE).props.value).toBe("More salt");
    expect(mockGuard.prevent).toBe(true);

    failing = false;
    await press(MESSAGES.save);
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(posts()).toHaveLength(2);
  });

  it("sends one tweak for a double tap", async () => {
    const save = held();
    sent = serve({ "GET /recipes/r1": () => reply(200, SOUP), "POST /recipes/r1/versions": save.route });
    await showForm();
    await type(NOTE, "More salt");

    // Both taps land before a re-render can show the button busy.
    const button = screen.getByRole("button", { name: MESSAGES.save });
    await act(async () => {
      button.props.onClick();
      button.props.onClick();
    });
    // And one more once it shows busy.
    await fireEvent.press(screen.getByRole("button", { name: MESSAGES.saving }));

    await waitFor(() => expect(save.count()).toBe(1));
    await save.answer(0, reply(201, SAVED));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(posts()).toHaveLength(1);
  });
});

describe("leaving", () => {
  it("goes without asking when nothing has changed", async () => {
    await showForm();
    await tryToLeave();
    expect(alert).not.toHaveBeenCalled();
    expect(mockRepeat).toHaveBeenCalledTimes(1);
  });

  it("asks before throwing away a tweak, and stays if asked to", async () => {
    await showForm();
    await type("Ingredient 1 amount", "3");

    await tryToLeave();
    expect(alert).toHaveBeenCalledWith(DISCARD_MESSAGES.discardTitle, DISCARD_MESSAGES.discardBody, expect.any(Array));
    expect(mockRepeat).not.toHaveBeenCalled();
    expect(alertButton(DISCARD_MESSAGES.keepEditing).style).toBe("cancel");

    await act(async () => alertButton(DISCARD_MESSAGES.discard).onPress?.());
    expect(mockRepeat).toHaveBeenCalledTimes(1);
  });

  it("asks about a note alone, too", async () => {
    await showForm();
    await type(NOTE, "More salt");
    await tryToLeave();
    expect(alert).toHaveBeenCalledTimes(1);
  });
});

describe("another account", () => {
  it("drops a save that answers after another account signed in", async () => {
    const save = held();
    sent = serve({ "GET /recipes/r1": () => reply(200, SOUP), "POST /recipes/r1/versions": save.route });
    const become = await showForm();
    await type(NOTE, "More salt");
    await press(MESSAGES.save);
    await waitFor(() => expect(save.count()).toBe(1));

    await become(ALEX);
    // Alex starts over, with nothing of Sam's typed.
    expect((await screen.findByLabelText(NOTE)).props.value).toBe("");

    await save.answer(0, reply(201, SAVED));
    expect(screen.queryByText(TWEAK_MESSAGES.saved)).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    const cached = store.getState().api.queries['getRecipe("r1")']?.data as RecipeDetailResponse;
    expect(cached.latest_version?.id).toBe("v2");
  });

  it("drops a failed save after signing out", async () => {
    const save = held();
    sent = serve({ "GET /recipes/r1": () => reply(200, SOUP), "POST /recipes/r1/versions": save.route });
    const become = await showForm();
    await type(NOTE, "More salt");
    await press(MESSAGES.save);
    await waitFor(() => expect(save.count()).toBe(1));

    await become({ status: "signedOut", endedByServer: false, lastEmail: "sam@example.com" });
    await save.answer(0, reply(404, { detail: "Not Found" }));
    expect(screen.queryByText(TWEAK_MESSAGES.changedOrNotYours)).toBeNull();
    expect(screen.getByRole("header", { name: MESSAGES.signInHeading })).toBeTruthy();
  });
});
