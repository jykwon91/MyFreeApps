import { DISCOVERY_EMPTY_COPY, DISCOVERY_READ_STAGES, DISCOVERY_SEARCH_STAGES } from "@myrecipes/api-client/constants/discovery";
import { RECIPE_FORM_PROBLEMS } from "@myrecipes/api-client/constants/recipeForm";
import type { DiscoveredDetail, DiscoveredRecipe } from "@myrecipes/api-client/types/recipe/discovery";
import { baseApi } from "@platform/core/store/baseApi";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storedItems } from "@platform/mobile/test-support/memorySecureStore";
import { ACCOUNT_EMAIL, storeSession, tokens } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { Alert, Linking } from "react-native";
import RecipeDetailRoute from "../app/recipes/[id]";
import NewRecipeRoute from "../app/recipes/new";
import DiscoveryDetailRoute from "../app/discover/[id]";
import { API_BASE_URL } from "../src/constants/api";
import { DISCOVERY_DETAIL_COPY } from "../src/constants/discovery";
import { NEW_RECIPE_MESSAGES } from "../src/constants/newRecipe";
import { discoveryCleared } from "../src/features/discovery/discoverySlice";
import { readDiscoveredRecipe } from "../src/features/discovery/readDiscoveredRecipe";
import { searchDiscoveredRecipes } from "../src/features/discovery/searchDiscoveredRecipes";
import { store } from "../src/lib/store";
import { APP_ROUTES } from "../test-support/renderApp";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("expo-notifications", () => jest.requireActual("../test-support/mockNotifications"));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));
// The device locale's decimal separator; "." unless a test is in a comma-decimal locale.
let mockDecimalSeparator: "." | "," = ".";
jest.mock("../src/utils/deviceDecimalSeparator", () => ({ deviceDecimalSeparator: () => mockDecimalSeparator }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const USER = { id: "u1", email: ACCOUNT_EMAIL, display_name: "Jane", totp_enabled: false, is_verified: true, is_superuser: false };

const FLAN: DiscoveredRecipe = {
  id: "flan1",
  title: "Flan Napolitano",
  source_type: "website",
  site_name: null,
  url: "https://www.seriouseats.com/flan-napolitano",
  image_url: "/discovery/image?url=https%3A%2F%2Fcdn.example%2Fflan.jpg&sig=t",
  summary: "A cream-cheese-enriched flan with a dense, silky set.",
  why_notable: "The only version that water-baths at 325F.",
  total_minutes: 90,
  difficulty: "hard",
};
const THREAD: DiscoveredRecipe = {
  id: "flan2",
  title: "My abuela's flan",
  source_type: "reddit",
  site_name: "r/Cooking",
  url: "https://reddit.com/r/Cooking/flan",
  image_url: null,
  summary: "A thread full of tested tweaks.",
  why_notable: null,
  total_minutes: null,
  difficulty: null,
};
const DETAIL: DiscoveredDetail = {
  title: "Flan Napolitano",
  source_type: "website",
  site_name: "Serious Eats",
  url: FLAN.url,
  image_url: FLAN.image_url,
  summary: "Dense and silky.",
  draft: {
    title: "Flan Napolitano",
    description: " A Mexican flan. ",
    source: "Serious Eats",
    servings: "8",
    prep_minutes: 20,
    cook_minutes: 60,
    ingredients: [
      { name: "sugar", quantity: 1, unit: "cup", note: null },
      { name: "cream cheese", quantity: 8, unit: "oz", note: "softened" },
      { name: " ", quantity: null, unit: null, note: null },
    ],
    steps: [{ instruction: "Caramelise the sugar." }, { instruction: "Bake in a water bath." }],
  },
  tips: ["Strain the custard twice."],
  community_notes: ["Most cooks bake it 10 minutes longer."],
  sources: ["https://www.seriouseats.com/flan-napolitano", "https://reddit.com/r/Cooking/flan"],
};

const reply = (status: number, data: unknown = {}): FakeReply => ({ status, data });

/** A signed-in phone, with search and read answering as given. */
function discoveryRoutes(extra: Record<string, FakeRoute> = {}) {
  return serve({
    "POST /auth/mobile/refresh": () => reply(200, tokens(1)),
    "GET /users/me": () => reply(200, USER),
    "POST /discovery/search": (body) => reply(200, { query: body.query, recipes: [FLAN, THREAD] }),
    "POST /discovery/detail": () => reply(200, DETAIL),
    ...extra,
  });
}

/** A reply the test sends when it's ready, to see the screen while it waits. */
function held(): { route: FakeRoute; answer: (value: FakeReply) => void } {
  let answer: (value: FakeReply) => void = () => undefined;
  const pending = new Promise<FakeReply>((resolve) => {
    answer = resolve;
  });
  return { route: () => pending, answer };
}

function openDiscover() {
  return renderRouter(
    { ...APP_ROUTES, "discover/[id]": DiscoveryDetailRoute, "recipes/[id]": RecipeDetailRoute, "recipes/new": NewRecipeRoute },
    { initialUrl: "/discover" },
  );
}

async function search(query: string): Promise<void> {
  await fireEvent.changeText(await screen.findByLabelText("Dish to search the web for"), query);
  await fireEvent.press(screen.getByRole("button", { name: "Search the web" }));
}

async function openFlan(): Promise<void> {
  await search("flan");
  await fireEvent.press(await screen.findByRole("button", { name: /^Flan Napolitano/ }));
}

const openURL = jest.spyOn(Linking, "openURL");

beforeEach(() => {
  storedItems.clear();
  storeSession();
  jest.clearAllMocks();
  openURL.mockResolvedValue(undefined);
  store.dispatch({ type: "discovery/discoveryCleared" });
  store.dispatch(baseApi.util.resetApiState());
});

afterAll(() => store.dispatch(baseApi.util.resetApiState()));

describe("searching", () => {
  it("starts idle, with suggestions, and only searches on an explicit submit", async () => {
    const sent = discoveryRoutes();
    await openDiscover();

    expect(await screen.findByText(DISCOVERY_EMPTY_COPY.heading)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search the web" }).props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByLabelText("Dish to search the web for"), "f");
    expect(screen.getByRole("button", { name: "Search the web" }).props.accessibilityState?.disabled).toBe(true);
    expect(sent.map(({ route }) => route)).not.toContain("POST /discovery/search");
  });

  it("shows the wait, then the results best first", async () => {
    const answer = held();
    const sent = discoveryRoutes({ "POST /discovery/search": answer.route });
    await openDiscover();
    await search("  flan ");

    expect(await screen.findByText(DISCOVERY_SEARCH_STAGES[0])).toBeTruthy();
    expect(screen.getByLabelText("Searching the web for recipes")).toBeTruthy();
    // What's being searched for can't change under the search, as on the website.
    expect(screen.getByLabelText("Dish to search the web for").props.editable).toBe(false);
    expect(sent).toContainEqual(expect.objectContaining({ route: "POST /discovery/search", body: { query: "flan" } }));

    await act(async () => answer.answer(reply(200, { query: "flan", recipes: [FLAN, THREAD] })));
    expect(await screen.findByText(/2 versions of/)).toBeTruthy();
    expect(screen.queryByLabelText("Searching the web for recipes")).toBeNull();
    expect(screen.getByLabelText("Dish to search the web for").props.editable).toBe(true);
    // The publisher falls back to the host, and time reads the way a cook says it.
    expect(screen.getByText("seriouseats.com")).toBeTruthy();
    expect(screen.getByText("1 hr 30 min")).toBeTruthy();
    expect(screen.getByText("Involved")).toBeTruthy();
    expect(screen.getByText("Reddit")).toBeTruthy();
    expect(screen.getByText("r/Cooking")).toBeTruthy();
  });

  it("shows only the latest search's answer, whichever order they come back in", async () => {
    const first = held();
    const second = held();
    let calls = 0;
    discoveryRoutes({ "POST /discovery/search": (...args) => ((calls += 1) === 1 ? first : second).route(...args) });
    await openDiscover();
    await act(async () => {
      void store.dispatch(searchDiscoveredRecipes("flan"));
      void store.dispatch(searchDiscoveredRecipes("tarte tatin"));
    });

    await act(async () => second.answer(reply(200, { query: "tarte tatin", recipes: [THREAD] })));
    expect(await screen.findByText(/1 version of/)).toBeTruthy();
    await act(async () => first.answer(reply(200, { query: "flan", recipes: [FLAN, THREAD] })));
    expect(screen.getByText("tarte tatin")).toBeTruthy();
    expect(screen.queryByText(/2 versions of/)).toBeNull();
    expect(store.getState().discovery.results?.query).toBe("tarte tatin");
  });

  it("takes only the answer to the read it's waiting on, not one sent before the account changed", async () => {
    const reads: ((value: FakeReply) => void)[] = [];
    discoveryRoutes({ "POST /discovery/detail": () => new Promise<FakeReply>((resolve) => reads.push(resolve)) });
    await act(async () => {
      void store.dispatch(readDiscoveredRecipe(FLAN));
      store.dispatch(discoveryCleared());
      void store.dispatch(readDiscoveredRecipe(FLAN));
    });
    await waitFor(() => expect(reads).toHaveLength(2));

    await act(async () => reads[0](reply(429, { detail: "slow down" })));
    expect(store.getState().discovery.reads.flan1?.status).toBe("reading");
    await act(async () => reads[1](reply(200, DETAIL)));
    expect(store.getState().discovery.reads.flan1).toEqual({ status: "read", detail: DETAIL });
  });

  it("loads pictures through our own api and keeps a tile when there's none or it fails", async () => {
    discoveryRoutes();
    await openDiscover();
    await search("flan");

    const picture = await screen.findByTestId("discovery-thumbnail");
    expect(picture.props.source).toEqual({ uri: `${API_BASE_URL}${FLAN.image_url}` });
    expect(screen.getAllByTestId("discovery-thumbnail-placeholder")).toHaveLength(1);
    await fireEvent(picture, "error");
    expect(screen.getAllByTestId("discovery-thumbnail-placeholder")).toHaveLength(2);
  });

  it("runs a suggestion as a search", async () => {
    const sent = discoveryRoutes();
    await openDiscover();
    await fireEvent.press(await screen.findByRole("button", { name: "Carbonara" }));

    expect(await screen.findByText(/2 versions of/)).toBeTruthy();
    expect(sent).toContainEqual(expect.objectContaining({ route: "POST /discovery/search", body: { query: "Carbonara" } }));
  });

  it.each([
    [422, /couldn't find recipes for that/],
    [429, /run a lot of searches/],
    [503, /isn't available right now/],
    [500, /Something went wrong searching/],
  ])("says why a search failed (%i) and clears the last results", async (status, message) => {
    let calls = 0;
    discoveryRoutes({
      "POST /discovery/search": (body) => {
        calls += 1;
        return calls === 1 ? reply(200, { query: body.query, recipes: [FLAN] }) : reply(status, { detail: "no" });
      },
    });
    await openDiscover();
    await search("flan");
    await screen.findByText(/1 version of/);

    await search("flan again");
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText(/versions? of flan/)).toBeNull();
    expect(screen.getByText(DISCOVERY_EMPTY_COPY.heading)).toBeTruthy();
  });

  it("finishes a search after switching tabs, and says so with a toast", async () => {
    const answer = held();
    discoveryRoutes({ "POST /discovery/search": answer.route });
    await openDiscover();
    await search("flan");
    await screen.findByText(DISCOVERY_SEARCH_STAGES[0]);

    await fireEvent.press(screen.getByRole("button", { name: /Recipes/ }));
    await act(async () => answer.answer(reply(200, { query: "flan", recipes: [FLAN, THREAD] })));
    expect(await screen.findByText("Found 2 versions of flan.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Show" }));
    expect(await screen.findByText(/2 versions of/)).toBeTruthy();
  });
});

describe("a result", () => {
  it("reads the page in full while showing what the card already knew", async () => {
    const answer = held();
    const sent = discoveryRoutes({ "POST /discovery/detail": answer.route });
    await openDiscover();
    await openFlan();

    expect(screen).toHavePathname("/discover/flan1");
    expect(await screen.findByText(DISCOVERY_READ_STAGES[0])).toBeTruthy();
    expect(screen.getByRole("header", { name: "Flan Napolitano" })).toBeTruthy();
    expect(screen.getByLabelText("Loading recipe")).toBeTruthy();
    expect(sent).toContainEqual(
      expect.objectContaining({ route: "POST /discovery/detail", body: { url: FLAN.url, title: FLAN.title } }),
    );

    await act(async () => answer.answer(reply(200, DETAIL)));
    expect(await screen.findByText("Dense and silky.")).toBeTruthy();
    expect(screen.getByText("Serious Eats")).toBeTruthy();
    expect(screen.getByText("1 cup sugar")).toBeTruthy();
    expect(screen.getByText("8 oz cream cheese (softened)")).toBeTruthy();
    expect(screen.getByLabelText("Step 2. Bake in a water bath.")).toBeTruthy();
    expect(screen.getByLabelText("Servings: 8")).toBeTruthy();
    expect(screen.getByText(DISCOVERY_DETAIL_COPY.tipsHeading)).toBeTruthy();
    expect(screen.getByText("Strain the custard twice.")).toBeTruthy();
    expect(screen.getByText("Most cooks bake it 10 minutes longer.")).toBeTruthy();
    expect(screen.getByText("reddit.com")).toBeTruthy();
  });

  it("keeps a read once done, so going back and in again costs nothing", async () => {
    const sent = discoveryRoutes();
    await openDiscover();
    await openFlan();
    await screen.findByText("Dense and silky.");

    await act(async () => router.back());
    await fireEvent.press(await screen.findByRole("button", { name: /^Flan Napolitano/ }));
    expect(await screen.findByText("Dense and silky.")).toBeTruthy();
    expect(sent.filter(({ route }) => route === "POST /discovery/detail")).toHaveLength(1);
  });

  it("carries on reading after leaving, and shows the answer on return without a second read", async () => {
    const answer = held();
    const sent = discoveryRoutes({ "POST /discovery/detail": answer.route });
    await openDiscover();
    await openFlan();
    await screen.findByText(DISCOVERY_READ_STAGES[0]);

    await act(async () => router.back());
    await act(async () => answer.answer(reply(200, DETAIL)));
    await fireEvent.press(await screen.findByRole("button", { name: /^Flan Napolitano/ }));
    expect(await screen.findByText("Dense and silky.")).toBeTruthy();
    expect(sent.filter(({ route }) => route === "POST /discovery/detail")).toHaveLength(1);
  });

  it("says why a read failed and tries again on request", async () => {
    let calls = 0;
    discoveryRoutes({
      "POST /discovery/detail": () => {
        calls += 1;
        return calls === 1 ? reply(422, { detail: "unreadable" }) : reply(200, DETAIL);
      },
    });
    await openDiscover();
    await openFlan();

    expect(await screen.findByText(/couldn't read a recipe off that page/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "View original" }));
    expect(openURL).toHaveBeenCalledWith(FLAN.url);

    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Dense and silky.")).toBeTruthy();
  });

  it("opens the original and every page it read from in the browser", async () => {
    discoveryRoutes();
    await openDiscover();
    await openFlan();
    await fireEvent.press(await screen.findByRole("button", { name: "View original" }));
    expect(openURL).toHaveBeenCalledWith(DETAIL.url);

    await fireEvent.press(screen.getByRole("link", { name: "reddit.com" }));
    expect(openURL).toHaveBeenCalledWith(DETAIL.sources[1]);
  });

  it("says the result is gone when it was opened without its search", async () => {
    discoveryRoutes();
    await renderRouter({ ...APP_ROUTES, "discover/[id]": DiscoveryDetailRoute }, { initialUrl: "/discover/flan1" });

    expect(await screen.findByText("This result isn't open anymore")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back to Discover" }));
    expect(screen).toHavePathname("/discover");
  });
});

describe("saving", () => {
  const SAVED = { id: "r9", title: "Flan Napolitano", description: "A Mexican flan.", source: null, owner_display_name: "Jane", latest_version: null };

  afterEach(() => {
    mockDecimalSeparator = ".";
  });

  async function openForm(): Promise<void> {
    await openDiscover();
    await openFlan();
    await fireEvent.press(await screen.findByRole("button", { name: "Save to my recipes" }));
    await screen.findByRole("button", { name: NEW_RECIPE_MESSAGES.create });
  }

  it("opens the new-recipe form filled in from the page, in the device's decimal separator", async () => {
    mockDecimalSeparator = ",";
    const halved = { ...DETAIL.draft.ingredients[0], quantity: 1.5 };
    const sent = discoveryRoutes({
      "POST /discovery/detail": () => reply(200, { ...DETAIL, draft: { ...DETAIL.draft, ingredients: [halved, ...DETAIL.draft.ingredients.slice(1)] } }),
    });
    await openForm();

    expect(screen).toHavePathname("/recipes/new");
    expect(screen.getByLabelText("Title, required").props.value).toBe("Flan Napolitano");
    expect(screen.getByLabelText(NEW_RECIPE_MESSAGES.sourceLabel).props.value).toBe(`Serious Eats (${DETAIL.url})`);
    expect(screen.getByLabelText("Ingredient 1 amount").props.value).toBe("1,5");
    expect(screen.getByLabelText("Ingredient 2 note").props.value).toBe("softened");
    expect(screen.getByLabelText("Step 2").props.value).toBe("Bake in a water bath.");
    expect(screen.queryByText(NEW_RECIPE_MESSAGES.draftNeedsReview)).toBeNull();
    expect(sent.map(({ route }) => route)).not.toContain("POST /recipes");
  });

  it("creates the recipe from the form, opens it, and then the result opens it instead of saving again", async () => {
    const sent = discoveryRoutes({
      "POST /recipes": () => reply(201, SAVED),
      "GET /recipes/r9": () => reply(200, SAVED),
    });
    await openForm();
    await fireEvent.press(screen.getByRole("button", { name: NEW_RECIPE_MESSAGES.create }));

    await waitFor(() => expect(screen).toHavePathname("/recipes/r9"));
    // Back goes to the result, so it's named for Discover.
    expect(screen).toHaveSearchParams(expect.objectContaining({ from: "discover" }));
    expect(sent.find(({ route }) => route === "POST /recipes")?.body).toEqual({
      title: "Flan Napolitano",
      description: "A Mexican flan.",
      source: `Serious Eats (${DETAIL.url})`,
      servings: "8",
      prep_minutes: 20,
      cook_minutes: 60,
      ingredients: [
        { name: "sugar", quantity: 1, unit: "cup", note: null, lineage_key: null },
        { name: "cream cheese", quantity: 8, unit: "oz", note: "softened", lineage_key: null },
      ],
      steps: [{ instruction: "Caramelise the sugar." }, { instruction: "Bake in a water bath." }],
    });

    // The recipe replaced the form, so Back returns to the result, which now opens the recipe.
    await act(async () => router.back());
    expect(screen).toHavePathname("/discover/flan1");
    expect(screen.queryByRole("button", { name: "Save to my recipes" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Open saved recipe" }));
    expect(screen).toHavePathname("/recipes/r9");
    expect(screen).toHaveSearchParams(expect.objectContaining({ from: "discover" }));
    expect(sent.filter(({ route }) => route === "POST /recipes")).toHaveLength(1);
  });

  it("leaves an untouched form without asking, and the result can still be saved", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    discoveryRoutes();
    await openForm();
    await act(async () => router.back());

    expect(alert).not.toHaveBeenCalled();
    expect(screen).toHavePathname("/discover/flan1");
    expect(screen.getByRole("button", { name: "Save to my recipes" })).toBeTruthy();
    alert.mockRestore();
  });

  it("shows the form's problems for what the page left out, and doesn't create it", async () => {
    const sent = discoveryRoutes({
      "POST /discovery/detail": () => reply(200, { ...DETAIL, draft: { ...DETAIL.draft, ingredients: [] } }),
    });
    await openDiscover();
    await openFlan();
    expect(await screen.findByText(DISCOVERY_DETAIL_COPY.noIngredients)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Save to my recipes" }));

    expect(await screen.findByText(NEW_RECIPE_MESSAGES.draftNeedsReview)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: NEW_RECIPE_MESSAGES.create }));
    expect(screen.getAllByText(RECIPE_FORM_PROBLEMS.ingredientsRequired).length).toBeGreaterThan(0);
    expect(screen).toHavePathname("/recipes/new");
    expect(sent.map(({ route }) => route)).not.toContain("POST /recipes");
  });

  it("puts the cursor in the title when the page didn't give one", async () => {
    discoveryRoutes({ "POST /discovery/detail": () => reply(200, { ...DETAIL, draft: { ...DETAIL.draft, title: "" } }) });
    await openForm();

    expect(screen.getByText(NEW_RECIPE_MESSAGES.draftNeedsReview)).toBeTruthy();
    expect(screen.getByLabelText("Title, required").props.autoFocus).toBe(true);
  });

  it("says the result is gone when the form is opened for one Discover no longer has", async () => {
    discoveryRoutes();
    await renderRouter(
      { ...APP_ROUTES, "discover/[id]": DiscoveryDetailRoute, "recipes/new": NewRecipeRoute },
      { initialUrl: "/recipes/new?discovery=flan1" },
    );

    expect(await screen.findByText("This result isn't open anymore")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Back to Discover" }));
    expect(screen).toHavePathname("/discover");
  });
});
