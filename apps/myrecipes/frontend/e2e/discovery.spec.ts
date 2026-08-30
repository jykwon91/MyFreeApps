import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

/**
 * E2E coverage for web recipe discovery (/discover).
 *
 * The two discovery endpoints are **stubbed at the network layer**, on
 * purpose. Live, each one is a Claude call with server-side web search: ~80s
 * for a search, ~40s for a read, real money per run, and different results
 * every time — nothing a suite can assert against or afford on every push.
 * Stubbing the two responses leaves everything this suite is actually about
 * running for real: routing and auth gating, the loading affordances, the card
 * grid, pictures loading through our own origin, opening a result, the
 * memoised second open, error recovery, and the hand-off into the recipe
 * editor, which saves a real recipe through the real API.
 *
 * The payload shapes are pinned on the backend side by
 * `apps/myrecipes/backend/tests/test_recipe_discovery.py`; the live path was
 * walked end to end by hand before this feature shipped.
 *
 * The gating tests need no account. The signed-in flow requires
 * E2E_USER_EMAIL / E2E_USER_PASSWORD pointing at a verified local account
 * (never hardcode credentials here — this file is committed).
 */

const OWNER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:5180";

// Long enough that the loading affordance is unambiguously observable, short
// enough to keep the suite quick. Live, these waits are tens of seconds.
const STUB_LATENCY_MS = 1200;

// A 1x1 PNG — enough for the browser to decode, so `naturalWidth > 0` proves
// the tile really loaded through /api/discovery/image rather than falling back
// to the placeholder.
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SEARCH_RESULTS = {
  query: "mexican flan",
  recipes: [
    {
      id: "aaaaaaaaaaaaaaaa",
      title: "Flan Napolitano",
      source_type: "website",
      site_name: "Serious Eats",
      url: "https://www.seriouseats.com/flan-napolitano",
      image_url: "/discovery/image?url=https%3A%2F%2Fcdn.example%2Fflan.jpg&sig=stub",
      summary: "A cream-cheese-enriched flan with a dense, silky set.",
      why_notable: "The only version that water-baths at 325F.",
      total_minutes: 90,
      difficulty: "medium",
    },
    {
      id: "bbbbbbbbbbbbbbbb",
      title: "Authentic Mexican Flan",
      source_type: "blog",
      site_name: "Mexico in My Kitchen",
      url: "https://www.mexicoinmykitchen.com/flan",
      // No usable picture — this card must still render, with a placeholder.
      image_url: null,
      summary: "The home-style version, five ingredients.",
      why_notable: null,
      total_minutes: 75,
      difficulty: "easy",
    },
    {
      id: "cccccccccccccccc",
      title: "Perfect Flan Every Time",
      source_type: "youtube",
      site_name: "A Cooking Channel",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      image_url:
        "/discovery/image?url=https%3A%2F%2Fi.ytimg.com%2Fvi%2FdQw4w9WgXcQ%2Fhqdefault.jpg&sig=stub",
      summary: "Technique walkthrough, start to finish.",
      why_notable: "Watch the caramel stage rather than read it.",
      total_minutes: null,
      difficulty: null,
    },
  ],
};

const DETAIL = {
  title: "Flan Napolitano",
  source_type: "website",
  site_name: "Serious Eats",
  url: "https://www.seriouseats.com/flan-napolitano",
  image_url: "/discovery/image?url=https%3A%2F%2Fcdn.example%2Fflan.jpg&sig=stub",
  summary: "A dense, cream-cheese flan set in a water bath.",
  draft: {
    title: "Flan Napolitano",
    description: "Silky and dense.",
    source: "Serious Eats",
    servings: "8",
    prep_minutes: 20,
    cook_minutes: 70,
    ingredients: [
      { name: "sweetened condensed milk", quantity: 1, unit: "can", note: null },
      { name: "cream cheese", quantity: 4, unit: "oz", note: "softened" },
      { name: "eggs", quantity: 5, unit: null, note: "room temperature" },
    ],
    steps: [
      { instruction: "Caramelize the sugar until deep amber." },
      { instruction: "Blend the custard until completely smooth." },
      { instruction: "Bake in a water bath at 325F for 70 minutes." },
    ],
  },
  tips: ["Do not let the caramel darken past amber."],
  community_notes: ["Commenters say to strain the custard twice."],
  sources: ["https://www.seriouseats.com/flan-napolitano"],
};

/** Stub the two paid endpoints; count the calls so memoisation can be asserted. */
async function stubDiscovery(page: Page) {
  const calls = { search: 0, detail: 0 };

  await page.route("**/api/discovery/image*", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG }),
  );
  await page.route("**/api/discovery/search", async (route) => {
    calls.search += 1;
    await new Promise((resolve) => setTimeout(resolve, STUB_LATENCY_MS));
    await route.fulfill({ status: 200, json: SEARCH_RESULTS });
  });
  await page.route("**/api/discovery/detail", async (route) => {
    calls.detail += 1;
    await new Promise((resolve) => setTimeout(resolve, STUB_LATENCY_MS));
    await route.fulfill({ status: 200, json: DETAIL });
  });

  return calls;
}


/** The result cards — buttons rather than links, since opening one costs a call. */
function resultCards(page: Page) {
  return page.getByRole("button").filter({ has: page.locator("h3") });
}

test.describe("Discovery — gating", () => {
  test("guest hitting /discover gets the inline sign-in card", async ({ page }) => {
    await page.goto("/discover");
    await expect(
      page.getByRole("heading", { name: "Sign in to discover recipes from the web" }),
    ).toBeVisible();
    // And nothing was searched on their behalf.
    await expect(page.getByRole("button", { name: "Search the web" })).toHaveCount(0);
  });

  test("the guest shell doesn't link to the gated page", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href="/discover"]')).toHaveCount(0);
  });
});

test.describe("Discovery — search, read, save", () => {
  // Serial: one worker, one seeded account, one probe recipe at a time.
  test.describe.configure({ mode: "serial" });
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "set E2E_USER_EMAIL + E2E_USER_PASSWORD (verified local account) to run",
  );

  let api: APIRequestContext;
  let token = "";
  const seeded: string[] = [];

  test.beforeAll(async () => {
    const anon = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const login = await anon.post("/api/auth/jwt/login", {
      form: { username: OWNER_EMAIL, password: OWNER_PASSWORD },
    });
    expect(login.ok(), "API login failed — check E2E_USER_* env").toBe(true);
    token = (await login.json()).access_token;
    await anon.dispose();
    api = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
  });

  // One real login for the whole suite, replayed into each page. Signing in
  // through the form once per test trips the per-IP login throttle by the
  // fourth test — and the sign-in form itself is covered by
  // public-recipes.spec.ts, so re-walking it here buys nothing.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("token", t), token);
  });

  test.afterAll(async () => {
    for (const id of seeded) {
      await api.delete(`/api/recipes/${id}`); // soft-delete the probe
    }
    await api?.dispose();
  });

  test("the idle page explains itself and offers a starting point", async ({ page }) => {
    await stubDiscovery(page);
    await page.goto("/discover");

    await expect(page.getByRole("heading", { name: "Discover recipes" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Find the best version of a dish" }),
    ).toBeVisible();
    // Searching is blocked until there is something to search for.
    await expect(page.getByRole("button", { name: "Search the web" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Mexican flan" })).toBeVisible();
  });

  test("a suggestion runs the search it names", async ({ page }) => {
    const calls = await stubDiscovery(page);
    await page.goto("/discover");

    await page.getByRole("button", { name: "Carbonara" }).click();
    await expect(resultCards(page).first()).toBeVisible();
    expect(calls.search).toBe(1);
  });

  test("searching shows a loading affordance, then the versions", async ({ page }) => {
    await stubDiscovery(page);
    await page.goto("/discover");

    await page.getByLabel("Dish to search the web for").fill("mexican flan");
    await page.getByRole("button", { name: "Search the web" }).click();

    // Feedback at click time, not at response time.
    await expect(page.getByText(/Searching the web for versions/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Searching..." })).toBeDisabled();

    await expect(page.getByText(/3 versions of\s*mexican flan/i)).toBeVisible();
    await expect(resultCards(page)).toHaveCount(3);
    await expect(page.getByText("Flan Napolitano")).toBeVisible();
    await expect(page.getByText("The only version that water-baths")).toBeVisible();
    await expect(page.getByText("1 hr 30 min")).toBeVisible();
  });

  test("the source mix is visible on the cards", async ({ page }) => {
    await stubDiscovery(page);
    await page.goto("/discover");
    await page.getByRole("button", { name: "Mexican flan" }).click();
    await expect(resultCards(page).first()).toBeVisible();

    // The point of the feature is that these are not all the same kind of
    // source. Scoped to the cards: the page's own blurb names them too.
    await expect(
      resultCards(page).nth(0).getByText("Recipe site", { exact: true }),
    ).toBeVisible();
    await expect(resultCards(page).nth(1).getByText("Blog", { exact: true })).toBeVisible();
    await expect(
      resultCards(page).nth(2).getByText("YouTube", { exact: true }),
    ).toBeVisible();
  });

  test("pictures load through our own origin, and a missing one still renders", async ({
    page,
  }) => {
    await stubDiscovery(page);
    await page.goto("/discover");
    await page.getByRole("button", { name: "Mexican flan" }).click();
    await expect(resultCards(page).first()).toBeVisible();

    // Two of the three results have a picture; the third gets a placeholder.
    const images = page.locator("main img");
    await expect(images).toHaveCount(2);
    for (const src of await images.evaluateAll((els) =>
      els.map((el) => el.getAttribute("src") ?? ""),
    )) {
      // The CSP is `img-src 'self'` — a third-party host would not load at all.
      expect(src.startsWith("/api/discovery/image?url=")).toBe(true);
    }
    await images.first().scrollIntoViewIfNeeded();
    await expect
      .poll(() => images.first().evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    // The card with no picture is still a card.
    await expect(page.getByText("Authentic Mexican Flan")).toBeVisible();
  });

  test("opening a result reads it in full, and re-opening it is free", async ({
    page,
  }) => {
    const calls = await stubDiscovery(page);
    await page.goto("/discover");
    await page.getByRole("button", { name: "Mexican flan" }).click();
    await expect(resultCards(page).first()).toBeVisible();

    await resultCards(page).first().click();
    await expect(page.getByText(/Opening the recipe/i)).toBeVisible();

    await expect(page.getByRole("button", { name: "Save to my recipes" })).toBeVisible();
    await expect(page.getByText("A dense, cream-cheese flan")).toBeVisible();
    await expect(page.getByText("4 oz cream cheese (softened)")).toBeVisible();
    await expect(page.getByText("Bake in a water bath at 325F")).toBeVisible();
    await expect(page.getByText("Do not let the caramel darken")).toBeVisible();
    await expect(page.getByText("strain the custard twice")).toBeVisible();

    // The original stays one click away, in a new tab.
    const original = page.getByRole("link", { name: /View original/ });
    await expect(original).toHaveAttribute("href", DETAIL.url);
    await expect(original).toHaveAttribute("target", "_blank");
    expect(calls.detail).toBe(1);

    // Back to the list, and in again — reads are memoised, so no second call.
    await page.getByRole("button", { name: "Back to results" }).click();
    await expect(page.getByText(/3 versions of/i)).toBeVisible();
    await resultCards(page).first().click();
    await expect(page.getByRole("button", { name: "Save to my recipes" })).toBeVisible();
    expect(calls.detail).toBe(1);
    expect(calls.search).toBe(1);
  });

  test("saving hands the draft to the editor and creates a real recipe", async ({
    page,
  }) => {
    await stubDiscovery(page);
    await page.goto("/discover");
    await page.getByRole("button", { name: "Mexican flan" }).click();
    await resultCards(page).first().click();
    await page.getByRole("button", { name: "Save to my recipes" }).click();

    await expect(page.getByRole("heading", { name: "Save this recipe" })).toBeVisible();
    // FormField renders a <label> that isn't associated with its control, so
    // getByLabel can't reach these — see apps/myrecipes/TECH_DEBT.md.
    const title = page.locator('input[maxlength="255"]');
    await expect(title).toHaveValue("Flan Napolitano");

    // The page it came from is recorded, so provenance survives the save.
    const source = page.locator('input[maxlength="1000"]');
    expect(await source.inputValue()).toContain(DETAIL.url);

    const probeTitle = `E2E Discovery Probe ${Date.now()}`;
    await title.fill(probeTitle);
    await page.getByRole("button", { name: "Create recipe" }).click();

    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    seeded.push(page.url().split("/").pop() ?? "");
    await expect(page.getByRole("heading", { name: probeTitle })).toBeVisible();
    // It saved as an ordinary recipe — the read draft came through intact.
    await expect(page.getByText("4 oz cream cheese (softened)")).toBeVisible();
  });

  test("a failed search explains itself instead of showing nothing", async ({ page }) => {
    await stubDiscovery(page);
    await page.route("**/api/discovery/search", (route) =>
      route.fulfill({ status: 422, json: { detail: "no results" } }),
    );
    await page.goto("/discover");

    await page.getByLabel("Dish to search the web for").fill("asdfghjkl");
    await page.getByRole("button", { name: "Search the web" }).click();
    await expect(page.getByText(/couldn't find recipes for that/i)).toBeVisible();
    // And the page is still usable — the query is kept so it can be retried.
    await expect(page.getByRole("button", { name: "Search the web" })).toBeEnabled();
  });

  test("a page that can't be read leaves the results intact", async ({ page }) => {
    await stubDiscovery(page);
    await page.goto("/discover");
    await page.getByRole("button", { name: "Mexican flan" }).click();
    await expect(resultCards(page).first()).toBeVisible();

    await page.route("**/api/discovery/detail", (route) =>
      route.fulfill({ status: 422, json: { detail: "unreadable" } }),
    );
    await resultCards(page).first().click();

    await expect(page.getByText(/couldn't read a recipe off that page/i)).toBeVisible();
    // Back on the list, not stranded on a blank detail view.
    await expect(resultCards(page)).toHaveCount(3);
  });
});
