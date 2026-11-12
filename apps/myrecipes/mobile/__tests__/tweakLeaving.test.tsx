import { TWEAK_MESSAGES } from "@myrecipes/api-client/constants/tweak";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { type MobileSession, type SessionState, SessionProvider, ToastProvider } from "@platform/mobile";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Provider } from "react-redux";
import { TWEAK_RECIPE_MESSAGES as MESSAGES } from "../src/constants/tweakRecipe";
import TweakRecipeScreen from "../src/features/tweakRecipe/TweakRecipeScreen";
import { makeStore } from "../src/lib/store";
import { recipeBackTitle } from "../src/utils/recipeBackTitle";
import { tweakBackTitle } from "../src/utils/tweakBackTitle";
import { type FakeStack, fakeStack } from "./support/fakeStack";

let mockStack: FakeStack;
let mockFrom: string | undefined;
jest.mock("expo-router", () => ({
  router: {
    back: () => mockStack.back(),
    canGoBack: () => mockStack.canGoBack(),
    dismiss: (count?: number) => mockStack.dismiss(count),
    replace: (href: string) => mockStack.replace(href),
  },
  useLocalSearchParams: () => ({ id: "r1", from: mockFrom }),
  useNavigation: () => ({ getState: () => mockStack.state() }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() }),
  usePreventRemove: () => undefined,
}));
jest.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 0 }));

const VERSION: VersionResponse = {
  id: "v2",
  recipe_id: "r1",
  version_number: 2,
  parent_version_id: "v1",
  change_note: "Less salt",
  servings: "4",
  prep_minutes: null,
  cook_minutes: null,
  created_at: "2026-11-11T00:00:00Z",
  ingredients: [{ id: "i1", lineage_key: "lk-salt", position: 0, name: "salt", quantity: 1, unit: "tsp", note: null }],
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

const SAM: SessionState = { status: "signedIn", email: "sam@example.com", sessionId: "s1" };
const SESSION = {
  start: async () => {},
  retryRestore: async () => {},
  getState: () => SAM,
  subscribe: () => () => undefined,
} as unknown as MobileSession;

const TABS = { name: "(tabs)" };
const TWEAK = { name: "recipes/[id]/tweak", params: { id: "r1" } };

async function saveTweak(): Promise<void> {
  serve({
    "GET /recipes/r1": () => ({ status: 200, data: SOUP }),
    "POST /recipes/r1/versions": () => ({ status: 201, data: { ...VERSION, id: "v3", version_number: 3 } }),
  });
  await render(
    <Provider store={makeStore()}>
      <SessionProvider session={SESSION}>
        <ToastProvider bottomOffset={0}>
          <TweakRecipeScreen />
        </ToastProvider>
      </SessionProvider>
    </Provider>,
  );
  await screen.findByTestId("tweak-recipe");
  await fireEvent.changeText(screen.getByLabelText("What did you change?, required"), "More salt");
  await fireEvent.press(screen.getByRole("button", { name: MESSAGES.save }));
  await screen.findByText(TWEAK_MESSAGES.saved);
}

describe("leaving after a tweak is saved", () => {
  beforeEach(() => {
    mockFrom = undefined;
  });

  it("lands on the recipe opened from Discover, whose Back still says Discover", async () => {
    const recipe = { name: "recipes/[id]", params: { id: "r1", from: "discover" } };
    mockStack = fakeStack([TABS, recipe, TWEAK]);
    await saveTweak();

    await waitFor(() => expect(mockStack.routes()).toEqual([TABS, recipe]));
    expect(recipeBackTitle(recipe.params.from)).toBe("Discover");
  });

  it("lands on the recipe from a diff, past the diff and the list, not back on the diff", async () => {
    mockFrom = "diff";
    const recipe = { name: "recipes/[id]", params: { id: "r1", from: "discover" } };
    const versions = { name: "recipes/[id]/versions", params: { id: "r1" } };
    const diff = { name: "recipes/[id]/versions/[vid]/diff", params: { id: "r1", vid: "v2", from: "versions" } };
    mockStack = fakeStack([TABS, recipe, versions, diff, { ...TWEAK, params: { id: "r1", from: "diff" } }]);
    await saveTweak();

    await waitFor(() => expect(mockStack.routes()).toEqual([TABS, recipe]));
  });

  it("opens the recipe in its place when another recipe is below, leaving that one as it was", async () => {
    const stew = { name: "recipes/[id]", params: { id: "r2" } };
    mockStack = fakeStack([TABS, stew, TWEAK]);
    await saveTweak();

    await waitFor(() => expect(mockStack.routes()).toEqual([TABS, stew, { name: "recipes/[id]", params: { id: "r1" } }]));
  });

  it("opens the recipe in its place when there's nothing to go back to", async () => {
    mockStack = fakeStack([TWEAK]);
    await saveTweak();

    await waitFor(() => expect(mockStack.routes()).toEqual([{ name: "recipes/[id]", params: { id: "r1" } }]));
  });
});

describe("tweakBackTitle", () => {
  it("names Back for the diff it was opened from, and the recipe otherwise", () => {
    expect(tweakBackTitle("diff")).toBe("Changes");
    expect(tweakBackTitle(undefined)).toBe("Recipe");
    expect(tweakBackTitle("constructor")).toBe("Recipe");
  });
});
