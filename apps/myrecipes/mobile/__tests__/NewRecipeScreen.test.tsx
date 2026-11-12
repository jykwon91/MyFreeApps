import {
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_FORM_PROBLEMS as PROBLEMS,
  RECIPE_SOURCE_MAX_LENGTH,
} from "@myrecipes/api-client/constants/recipeForm";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import api from "@platform/core/lib/api";
import { DISCARD_MESSAGES, type MobileSession, type SessionState, SessionProvider, ToastProvider } from "@platform/mobile";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { Alert, type AlertButton } from "react-native";
import { Provider } from "react-redux";
import { NEW_RECIPE_MESSAGES as MESSAGES } from "../src/constants/newRecipe";
import NewRecipeScreen from "../src/features/newRecipe/NewRecipeScreen";
import { makeStore } from "../src/lib/store";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRepeat = jest.fn();
// What the screen last told the navigator about leaving: whether to stop it, and what to do instead.
const mockGuard: { prevent: boolean; ask: ((event: { repeat: () => void }) => void) | null } = { prevent: false, ask: null };
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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

const CREATED = {
  id: "r-new",
  title: "Tomato soup",
  description: "Weeknight soup",
  source: "Grandma",
  created_at: "2026-11-11T00:00:00Z",
  updated_at: "2026-11-11T00:00:00Z",
  version_count: 1,
  latest_version_number: 1,
  is_owner: true,
  owner_display_name: "Sam",
  best_rating: null,
  last_cooked_at: null,
  latest_version: null,
};

type Reply = { status: number; data: unknown };
let reply: Reply;
let gate: Promise<void> = Promise.resolve();
const sent: InternalAxiosRequestConfig[] = [];
const originalAdapter = api.defaults.adapter;

const adapter: AxiosAdapter = async (config) => {
  sent.push(config);
  await gate;
  const { status, data } = reply;
  if (status >= 400) throw Object.assign(new Error("failed"), { response: { status, data }, config });
  return { status, data, statusText: "", headers: {}, config };
};

const SIGNED_IN: SessionState = { status: "signedIn", email: "sam@example.com", sessionId: "s1" };

function fakeSession(state: SessionState): MobileSession {
  return { start: async () => {}, getState: () => state, subscribe: () => () => {} } as unknown as MobileSession;
}

let store: ReturnType<typeof makeStore>;

async function show(state: SessionState = SIGNED_IN) {
  store = makeStore();
  await render(
    <Provider store={store}>
      <SessionProvider session={fakeSession(state)}>
        <ToastProvider bottomOffset={0}>
          <NewRecipeScreen />
        </ToastProvider>
      </SessionProvider>
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

function alertButton(label: string): AlertButton {
  const button = alert.mock.calls.at(-1)?.[2]?.find((candidate) => candidate.text === label);
  if (!button) throw new Error(`No "${label}" button on the last alert`);
  return button;
}

function postedBody(): unknown {
  const post = sent.find((config) => config.method === "post" && config.url === "/recipes");
  if (!post) throw new Error("nothing was posted to /recipes");
  return typeof post.data === "string" ? JSON.parse(post.data) : post.data;
}

async function fillMinimalRecipe() {
  await type("Title, required", "Tomato soup");
  await type("Ingredient 1", "tomatoes");
  await type("Step 1", "Simmer.");
}

beforeEach(() => {
  api.defaults.adapter = adapter;
  sent.length = 0;
  gate = Promise.resolve();
  reply = { status: 201, data: CREATED };
  mockGuard.prevent = false;
  mockGuard.ask = null;
  mockDecimalSeparator = ".";
});

afterEach(() => {
  jest.clearAllMocks();
  api.defaults.adapter = originalAdapter;
});

describe("signed out", () => {
  it("asks to sign in, as the website does, and signing in comes back to the form", async () => {
    await show({ status: "signedOut", endedByServer: false, lastEmail: null });
    expect(screen.getByRole("header", { name: MESSAGES.signInHeading })).toBeTruthy();
    expect(screen.queryByTestId("new-recipe")).toBeNull();
    await press(MESSAGES.signIn);
    expect(mockPush).toHaveBeenCalledWith("/sign-in");
  });

  it("shows a skeleton, not a sign-in prompt, while it reads the stored session", async () => {
    await show({ status: "restoring" });
    expect(screen.queryByText(MESSAGES.signInHeading)).toBeNull();
    expect(screen.getByTestId("new-recipe-skeleton", { includeHiddenElements: true })).toBeTruthy();
  });
});

describe("checking before it saves", () => {
  it("says what's missing on the fields only once Create is pressed, and sends nothing", async () => {
    await show();
    expect(screen.queryByText(PROBLEMS.titleRequired)).toBeNull();

    await press(MESSAGES.create);

    // On the title field, and toasted.
    expect(screen.getAllByText(PROBLEMS.titleRequired)).toHaveLength(2);
    expect(screen.getByText(PROBLEMS.ingredientsRequired)).toBeTruthy();
    expect(screen.getByText(PROBLEMS.stepsRequired)).toBeTruthy();
    expect(sent).toHaveLength(0);

    // Typing clears the field's error; the toast goes on its own.
    await type("Title, required", "Soup");
    expect(screen.getAllByText(PROBLEMS.titleRequired)).toHaveLength(1);
    expect(screen.getByLabelText("Title, required").props.accessibilityHint).toBeUndefined();
  });

  it("won't quietly drop an amount it can't read, or one with no ingredient named", async () => {
    await show();
    await fillMinimalRecipe();
    await type("Ingredient 1 amount", "1/2");
    await press(MESSAGES.addIngredient);
    await type("Ingredient 2 unit", "cups");
    await type("Cook (min)", "soon");

    await press(MESSAGES.create);

    expect(screen.getByText(PROBLEMS.quantityInvalid("."))).toBeTruthy();
    expect(screen.getByText(PROBLEMS.ingredientNameRequired)).toBeTruthy();
    // On the field, and toasted as the first problem down the form.
    expect(screen.getAllByText(PROBLEMS.minutesInvalid)).toHaveLength(2);
    expect(sent).toHaveLength(0);
  });
});

describe("length limits", () => {
  it("counts towards a long field's limit as the backend does, and says straight away when it's over", async () => {
    await show();
    expect(screen.queryByTestId("character-counter", { includeHiddenElements: true })).toBeNull();

    // An emoji counts once, as a code point, and spaces round it aren't sent.
    await type("Description", `  ${"\u{1F345}".repeat(RECIPE_DESCRIPTION_MAX_LENGTH)}  `);
    expect(screen.getByText("5,000 / 5,000", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText(/Keep this to/)).toBeNull();

    await type("Source", "s".repeat(RECIPE_SOURCE_MAX_LENGTH + 1));
    expect(screen.getByText("1,001 / 1,000", { includeHiddenElements: true })).toBeTruthy();
    const sourceTooLong = tooLongProblem("x".repeat(RECIPE_SOURCE_MAX_LENGTH + 1), RECIPE_SOURCE_MAX_LENGTH) as string;
    expect(screen.getByText(sourceTooLong)).toBeTruthy();
    // Nothing else is called missing until Create is pressed.
    expect(screen.queryByText(PROBLEMS.titleRequired)).toBeNull();

    await fillMinimalRecipe();
    await press(MESSAGES.create);
    expect(sent).toHaveLength(0);
  });
});

describe("creating", () => {
  it("sends exactly what the website sends, then opens the new recipe in place of the form", async () => {
    await show();
    await type("Title, required", "  Tomato soup ");
    await type("Description", "Weeknight soup");
    await type("Source", "Grandma");
    await type("Servings", "4");
    await type("Prep (min)", "10");
    await type("Cook (min)", "25");
    await type("Ingredient 1", "basil");
    await press(MESSAGES.addIngredient);
    await type("Ingredient 2", "tomatoes");
    await type("Ingredient 2 amount", "2");
    await type("Ingredient 2 unit", "cans");
    await type("Ingredient 2 note", "crushed");
    await press("Move ingredient 2 up");
    await press(MESSAGES.addIngredient);
    await press("Remove ingredient 3");
    await type("Step 1", "Simmer.");
    await press(MESSAGES.addStep);
    await type("Step 2", "Open the cans.");
    await press("Move step 2 up");

    const open = holdResponses();
    await press(MESSAGES.create);
    // Busy from the press, and leaving can't walk away from a save in flight.
    expect(screen.getByText(MESSAGES.creating)).toBeTruthy();
    await tryToLeave();
    expect(alert).not.toHaveBeenCalled();
    expect(mockRepeat).not.toHaveBeenCalled();
    await act(async () => open());

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/recipes/[id]",
        params: { id: "r-new", title: "Tomato soup", owner: "Sam" },
      }),
    );
    expect(postedBody()).toEqual({
      title: "Tomato soup",
      description: "Weeknight soup",
      source: "Grandma",
      servings: "4",
      prep_minutes: 10,
      cook_minutes: 25,
      ingredients: [
        { name: "tomatoes", quantity: 2, unit: "cans", note: "crushed", lineage_key: null },
        { name: "basil", quantity: null, unit: null, note: null, lineage_key: null },
      ],
      steps: [{ instruction: "Open the cans." }, { instruction: "Simmer." }],
    });
    expect(screen.getByText(MESSAGES.created)).toBeTruthy();
    // Leaving for the recipe isn't asked about, and the recipe is already there to show.
    expect(mockGuard.prevent).toBe(false);
    expect(store.getState().api.queries['getRecipe("r-new")']?.data).toEqual(CREATED);
  });

  it("reads amounts in the device's decimal separator, and says so in it", async () => {
    mockDecimalSeparator = ",";
    await show();
    await fillMinimalRecipe();
    await type("Ingredient 1 amount", "0.5");

    await press(MESSAGES.create);
    expect(screen.getAllByText(PROBLEMS.decimalSeparatorHint(","))).toHaveLength(2);
    expect(sent).toHaveLength(0);

    await type("Ingredient 1 amount", "0,5");
    await press(MESSAGES.addIngredient);
    await type("Ingredient 2", "water");
    await type("Ingredient 2 amount", "1250");
    await press(MESSAGES.create);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(postedBody()).toMatchObject({
      ingredients: [expect.objectContaining({ name: "tomatoes", quantity: 0.5 }), expect.objectContaining({ name: "water", quantity: 1250 })],
    });
  });

  it("keeps everything typed when the server says no, and can try again", async () => {
    await show();
    await fillMinimalRecipe();
    reply = { status: 500, data: { detail: "boom" } };

    await press(MESSAGES.create);

    expect(await screen.findByText(MESSAGES.couldntCreate)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title, required").props.value).toBe("Tomato soup");
    expect(mockGuard.prevent).toBe(true);

    reply = { status: 201, data: CREATED };
    await press(MESSAGES.create);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    expect(sent.filter((config) => config.method === "post")).toHaveLength(2);
  });
});

describe("leaving", () => {
  it("goes without asking when nothing has been typed", async () => {
    await show();
    await press(MESSAGES.addIngredient);
    await tryToLeave();
    expect(alert).not.toHaveBeenCalled();
    expect(mockRepeat).toHaveBeenCalledTimes(1);
  });

  it("asks before throwing away what's typed, and stays if asked to", async () => {
    await show();
    await type("Title, required", "Soup");

    await tryToLeave();
    expect(alert).toHaveBeenCalledWith(DISCARD_MESSAGES.discardTitle, DISCARD_MESSAGES.discardBody, expect.any(Array));
    expect(mockRepeat).not.toHaveBeenCalled();

    expect(alertButton(DISCARD_MESSAGES.keepEditing).style).toBe("cancel");
    await act(async () => alertButton(DISCARD_MESSAGES.discard).onPress?.());
    expect(mockRepeat).toHaveBeenCalledTimes(1);
  });
});
