import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

/**
 * E2E coverage for the public-read / auth-write conversion.
 *
 * Layout/gating tests are unconditional (no data required). The seeded-recipe
 * suite logs in via the API, creates one recipe, asserts the guest and owner
 * views against it, and soft-deletes it afterwards — so it runs green on an
 * empty local library. It requires E2E_USER_EMAIL / E2E_USER_PASSWORD to
 * point at a verified local account (never hardcode credentials here — this
 * file is committed).
 *
 * Run against a local stack (backend :8008 + `npm run dev`), or point
 * BASE_URL at an already-running frontend whose /api proxies to the backend.
 */

const MISSING_ID = "00000000-0000-0000-0000-000000000000";
const OWNER_EMAIL = process.env.E2E_USER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.E2E_USER_PASSWORD ?? "";
const BASE_URL = process.env.BASE_URL ?? "http://localhost:5180";
// Unique per run so a probe leaked by an aborted earlier run can't collide.
const SEEDED_TITLE = `E2E Public Browsing Probe ${Date.now()}`;

/** The AuthRequired card's button — scoped to <main> because the guest shell
 * renders its own "Sign in" CTAs in the sidebar and topbar. */
function cardSignIn(page: Page) {
  return page.getByRole("main").getByRole("button", { name: "Sign in" });
}

test.describe("Public browsing — guest layout & gating", () => {
  test("recipes list renders in the guest shell with a sign-in CTA", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Sign in").first()).toBeVisible();
    // The public library UI renders — search box is available to guests.
    await expect(
      page.getByPlaceholder("Search recipes by title")
    ).toBeVisible();
    // Owner-scoped filter is an authenticated-only affordance.
    await expect(page.getByText("My recipes")).toHaveCount(0);
  });

  test("guest hitting /recipes/new gets the inline sign-in card", async ({
    page,
  }) => {
    await page.goto("/recipes/new");
    await expect(
      page.getByRole("heading", { name: "Sign in to create a new recipe" })
    ).toBeVisible();
    await cardSignIn(page).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("guest hitting gated account pages gets the sign-in card", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Sign in to manage your settings" })
    ).toBeVisible();

    await page.goto("/security");
    await expect(
      page.getByRole("heading", {
        name: "Sign in to manage account security",
      })
    ).toBeVisible();
  });

  test("guest hitting the tweak editor gets the sign-in card", async ({
    page,
  }) => {
    await page.goto(`/recipes/${MISSING_ID}/tweak`);
    await expect(
      page.getByRole("heading", { name: "Sign in to tweak this recipe" })
    ).toBeVisible();
  });

  test("missing recipe shows the public 404 copy", async ({ page }) => {
    await page.goto(`/recipes/${MISSING_ID}`);
    await expect(
      page.getByText("This recipe doesn't exist. It may have been deleted.")
    ).toBeVisible();
  });
});

test.describe("Seeded recipe — guest vs owner", () => {
  // Serial: one worker → one beforeAll → exactly one seeded probe. Parallel
  // workers would each run beforeAll and seed duplicate probe recipes.
  test.describe.configure({ mode: "serial" });
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "set E2E_USER_EMAIL + E2E_USER_PASSWORD (verified local account) to run"
  );

  let api: APIRequestContext;
  let recipeId = "";

  test.beforeAll(async () => {
    // API login + seed one recipe so these tests pass on an empty library.
    const anon = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const login = await anon.post("/api/auth/jwt/login", {
      form: { username: OWNER_EMAIL, password: OWNER_PASSWORD },
    });
    expect(login.ok(), "API login failed — check E2E_USER_* env").toBe(true);
    const { access_token } = await login.json();
    await anon.dispose();

    api = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${access_token}` },
    });
    const created = await api.post("/api/recipes", {
      data: { title: SEEDED_TITLE, ingredients: [], steps: [] },
    });
    expect(created.status(), "seeding the probe recipe failed").toBe(201);
    recipeId = (await created.json()).id;
  });

  test.afterAll(async () => {
    if (recipeId) {
      await api.delete(`/api/recipes/${recipeId}`); // soft-delete the probe
    }
    await api?.dispose();
  });

  test("guest sees the recipe read-only — no write or cook-log UI", async ({
    page,
  }) => {
    await page.goto(`/recipes/${recipeId}`);
    await expect(
      page.getByRole("heading", { name: SEEDED_TITLE })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tweak this recipe" })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "I made it" })).toHaveCount(
      0
    );
    await expect(page.getByRole("heading", { name: "Cook log" })).toHaveCount(
      0
    );
  });

  test("guest sees the recipe on the public list", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: new RegExp(SEEDED_TITLE) })
    ).toBeVisible();
  });

  test("owner signs in, filters to My recipes, and sees owner controls", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(OWNER_EMAIL);
    await page.getByLabel("Password").fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/^(?!.*\/login).*$/, { timeout: 10_000 });

    await page.goto("/");
    const mineChip = page.getByText("My recipes");
    await expect(mineChip).toBeVisible();
    await mineChip.click();
    await expect(page).toHaveURL(/owner=me/);

    await page
      .getByRole("link", { name: new RegExp(SEEDED_TITLE) })
      .click();
    await expect(page).toHaveURL(new RegExp(`/recipes/${recipeId}$`));
    await expect(
      page.getByRole("button", { name: "I made it" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cook log" })
    ).toBeVisible();
  });
});
