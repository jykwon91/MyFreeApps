import type { DiscoveredDetail, DiscoveredRecipe } from "@myrecipes/api-client/types/recipe/discovery";
import { baseApi } from "@platform/core/store/baseApi";
import { serve } from "@platform/mobile/test-support/fakeServer";
import { storeSession, tokens } from "@platform/mobile/test-support/storedSession";
import type { FakeReply } from "@platform/mobile/test-support/types/FakeReply";
import type { FakeRoute } from "@platform/mobile/test-support/types/FakeRoute";
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import DiscoveryDetailRoute from "../app/discover/[id]";
import RecipeDetailRoute from "../app/recipes/[id]";
import NewRecipeRoute from "../app/recipes/new";
import { NEW_RECIPE_MESSAGES } from "../src/constants/newRecipe";
import { session } from "../src/lib/session";
import { store } from "../src/lib/store";
import { APP_ROUTES } from "../test-support/renderApp";

jest.mock("expo-secure-store", () => jest.requireActual("@platform/mobile/test-support/memorySecureStore"));
jest.mock("expo-application", () => jest.requireActual("@platform/mobile/test-support/fakeApplication"));
jest.mock("expo-device", () => ({ deviceName: "Test Phone", modelName: "iPhone" }));
jest.mock("expo-notifications", () => jest.requireActual("../test-support/mockNotifications"));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

// Discovery work an account started must not land in the next account's Discover once it signs
// out and another signs in. The session is read once per file, so the tests run in order, each
// signing the last one's account out and the next one in. They check what the next account sees.
// Signing out resets the API cache, and RTK Query's resetApiState aborts the queries and mutations
// it has running, so the last account's search, read or create rejects with an AbortError rather
// than delivering its answer. The slice's request-id and generation checks guard against the
// answers that get through anyway, and are tested directly, in discover and discoveryParts.

const FLAN: DiscoveredRecipe = {
  id: "flan1",
  title: "Flan Napolitano",
  source_type: "website",
  site_name: "Serious Eats",
  url: "https://www.seriouseats.com/flan-napolitano",
  image_url: null,
  summary: "A dense, silky flan.",
  why_notable: null,
  total_minutes: null,
  difficulty: null,
};
const TARTE: DiscoveredRecipe = { ...FLAN, id: "tarte1", title: "Tarte Tatin", url: "https://example.com/tarte" };
const DETAIL: DiscoveredDetail = {
  title: "Flan Napolitano",
  source_type: "website",
  site_name: "Serious Eats",
  url: FLAN.url,
  image_url: null,
  summary: "Read in full.",
  draft: {
    title: "Flan Napolitano",
    description: null,
    source: null,
    servings: null,
    prep_minutes: null,
    cook_minutes: null,
    ingredients: [{ name: "sugar", quantity: 1, unit: "cup", note: null }],
    steps: [{ instruction: "Bake." }],
  },
  tips: [],
  community_notes: [],
  sources: [],
};

const reply = (status: number, data: unknown = {}): FakeReply => ({ status, data });

/** Replies the test sends one by one, in the order the requests were made. */
function queued(): { route: FakeRoute; answer: (index: number, value: FakeReply) => void } {
  const answers: ((value: FakeReply) => void)[] = [];
  return {
    route: () => new Promise<FakeReply>((resolve) => answers.push(resolve)),
    answer: (index, value) => answers[index](value),
  };
}

let nextAccount = 1;

function routes(extra: Record<string, FakeRoute>) {
  return serve({
    "POST /auth/mobile/refresh": () => reply(200, tokens(1)),
    "POST /auth/mobile/login": () => reply(200, tokens((nextAccount += 1))),
    "POST /auth/mobile/logout": () => reply(204),
    "GET /auth/mobile/sessions": () => reply(200, []),
    "GET /users/me": () => reply(200, { id: "u", email: "x@example.com", display_name: "X", totp_enabled: false, is_verified: true, is_superuser: false }),
    ...extra,
  });
}

async function switchAccount(): Promise<void> {
  await act(async () => {
    await session.signOut();
  });
  await act(async () => {
    await session.signIn({ email: `account${nextAccount + 1}@example.com`, password: "a long password" });
  });
  await act(async () => router.navigate("/discover"));
}

async function search(query: string): Promise<void> {
  await fireEvent.changeText(await screen.findByLabelText("Dish to search the web for"), query);
  await fireEvent.press(screen.getByRole("button", { name: "Search the web" }));
}

beforeAll(() => storeSession());

// Each test's screen is cleaned up after it; the session, and its account, carry on to the next.
beforeEach(async () => {
  routes({});
  await renderRouter(
    { ...APP_ROUTES, "discover/[id]": DiscoveryDetailRoute, "recipes/[id]": RecipeDetailRoute, "recipes/new": NewRecipeRoute },
    { initialUrl: "/discover" },
  );
  await screen.findByLabelText("Dish to search the web for");
});

afterAll(() => store.dispatch(baseApi.util.resetApiState()));

describe("after another account signs in", () => {
  it("drops a search the last account left running, even one that fails later", async () => {
    const searches = queued();
    let calls = 0;
    routes({
      "POST /discovery/search": (...args) =>
        (calls += 1) === 1 ? searches.route(...args) : reply(200, { query: "tarte", recipes: [TARTE] }),
    });
    await search("flan");
    // Away from Discover, so a current answer would toast.
    await act(async () => router.navigate("/settings"));
    await switchAccount();

    expect(screen.getByLabelText("Dish to search the web for").props.value).toBe("");
    await search("tarte");
    expect(await screen.findByRole("button", { name: /^Tarte Tatin/ })).toBeTruthy();

    await act(async () => searches.answer(0, reply(200, { query: "flan", recipes: [FLAN] })));
    expect(screen.queryByRole("button", { name: /^Flan Napolitano/ })).toBeNull();
    expect(screen.queryByText(/Found .* of flan/)).toBeNull();
    expect(store.getState().discovery.results?.query).toBe("tarte");

    const failing = queued();
    routes({ "POST /discovery/search": failing.route });
    await search("flan");
    await switchAccount();
    await act(async () => failing.answer(0, reply(429, { detail: "slow down" })));
    expect(store.getState().discovery.search).toBeNull();
    expect(screen.queryByText(/didn't finish/)).toBeNull();
  });

  it("shows only the next account's search when the last one's lands while it waits", async () => {
    const searches = queued();
    routes({ "POST /discovery/search": searches.route });
    await search("flan");
    await switchAccount();
    await search("tarte");
    // Away from Discover, so each current answer toasts.
    await act(async () => router.navigate("/settings"));

    await act(async () => searches.answer(0, reply(200, { query: "flan", recipes: [FLAN] })));
    expect(screen.queryByText(/of flan/)).toBeNull();
    expect(store.getState().discovery.search?.status).toBe("searching");
    expect(store.getState().discovery.results).toBeNull();

    await act(async () => searches.answer(1, reply(200, { query: "tarte", recipes: [TARTE] })));
    expect(await screen.findByText("Found 1 version of tarte.")).toBeTruthy();
    expect(screen.queryByText(/of flan/)).toBeNull();
    await act(async () => router.navigate("/discover"));
    expect(await screen.findByRole("button", { name: /^Tarte Tatin/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Flan Napolitano/ })).toBeNull();
  });

  it("drops a read the last account left running, though the next opens the same result", async () => {
    const reads = queued();
    routes({
      "POST /discovery/search": (body) => reply(200, { query: body.query, recipes: [FLAN] }),
      "POST /discovery/detail": reads.route,
    });
    await search("flan");
    await fireEvent.press(await screen.findByRole("button", { name: /^Flan Napolitano/ }));
    await switchAccount();

    await search("flan");
    await fireEvent.press(await screen.findByRole("button", { name: /^Flan Napolitano/ }));
    await waitFor(() => expect(store.getState().discovery.reads.flan1?.status).toBe("reading"));

    // The last account's read fails late; this one's is still waiting, then lands.
    await act(async () => reads.answer(0, reply(429, { detail: "slow down" })));
    expect(store.getState().discovery.reads.flan1?.status).toBe("reading");
    await act(async () => reads.answer(1, reply(200, DETAIL)));
    expect(await screen.findByText("Read in full.")).toBeTruthy();
  });

  it("doesn't mark the result saved for a create the last account left running", async () => {
    const creates = queued();
    routes({
      "POST /discovery/search": (body) => reply(200, { query: body.query, recipes: [FLAN] }),
      "POST /discovery/detail": () => reply(200, DETAIL),
      "POST /recipes": creates.route,
    });
    await search("flan");
    await fireEvent.press(await screen.findByRole("button", { name: /^Flan Napolitano/ }));
    await fireEvent.press(await screen.findByRole("button", { name: "Save to my recipes" }));
    await fireEvent.press(await screen.findByRole("button", { name: NEW_RECIPE_MESSAGES.create }));
    await switchAccount();

    await act(async () => creates.answer(0, reply(201, { id: "r1", title: "Flan Napolitano", description: null, source: null, owner_display_name: "A", latest_version: null })));
    expect(store.getState().discovery.saved).toEqual({});

    await search("flan");
    await fireEvent.press(await screen.findByRole("button", { name: /^Flan Napolitano/ }));
    expect(await screen.findByRole("button", { name: "Save to my recipes" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open saved recipe" })).toBeNull();
  });
});
