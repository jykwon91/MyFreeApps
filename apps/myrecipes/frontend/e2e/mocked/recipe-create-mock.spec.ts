/**
 * No-backend E2E for /recipes/new: a signed-in user fills the form, reorders
 * rows and lands on the new recipe; an amount the form can't read, or one with
 * no ingredient named, stops the save instead of being dropped; and a server
 * error keeps everything typed.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "@platform/ui/testing/mockResponse";
import { stubSignedInShell, TEST_USER } from "@platform/ui/testing/mockSession";

const CREATED_ID = "11111111-1111-1111-1111-111111111111";

function createdRecipe(body: Record<string, unknown>) {
  const now = "2026-11-11T00:00:00Z";
  const ingredients = (body.ingredients as Array<Record<string, unknown>>).map((ing, index) => ({
    id: `i${index}`,
    lineage_key: `l${index}`,
    position: index,
    name: ing.name,
    quantity: ing.quantity ?? null,
    unit: ing.unit ?? null,
    note: ing.note ?? null,
  }));
  const steps = (body.steps as Array<{ instruction: string }>).map((step, index) => ({
    id: `s${index}`,
    position: index,
    instruction: step.instruction,
  }));
  return {
    id: CREATED_ID,
    title: body.title,
    description: body.description ?? null,
    source: body.source ?? null,
    created_at: now,
    updated_at: now,
    version_count: 1,
    latest_version_number: 1,
    is_owner: true,
    owner_display_name: TEST_USER.display_name,
    best_rating: null,
    last_cooked_at: null,
    latest_version: {
      id: "v1",
      recipe_id: CREATED_ID,
      version_number: 1,
      parent_version_id: null,
      change_note: null,
      servings: body.servings ?? null,
      prep_minutes: body.prep_minutes ?? null,
      cook_minutes: body.cook_minutes ?? null,
      created_at: now,
      ingredients,
      steps,
    },
  };
}

/** POST /recipes answers `postStatus`; the new recipe's detail reads answer from what was posted. */
async function stubRecipes(page: Page, postStatus: number): Promise<Array<Record<string, unknown>>> {
  const posted: Array<Record<string, unknown>> = [];
  let created: ReturnType<typeof createdRecipe> | null = null;
  await page.route(/\/api\/recipes(\?|$)/, (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fulfill(json([]));
    const body = request.postDataJSON() as Record<string, unknown>;
    posted.push(body);
    if (postStatus !== 201) return route.fulfill(json({ detail: "boom" }, postStatus));
    created = createdRecipe(body);
    return route.fulfill(json(created, 201));
  });
  await page.route(new RegExp(`/api/recipes/${CREATED_ID}(/.*)?(\\?.*)?$`), (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!created) return route.fulfill(json({ detail: "Not Found" }, 404));
    if (path.endsWith(`/recipes/${CREATED_ID}`)) return route.fulfill(json(created));
    if (path.endsWith("/versions/v1")) return route.fulfill(json(created.latest_version));
    return route.fulfill(json([]));
  });
  return posted;
}

function toast(page: Page, message: string) {
  return page.getByRole("region", { name: "Notifications" }).getByText(message, { exact: true });
}

async function fillRequired(page: Page) {
  await page.getByLabel("Title").fill("Tomato soup");
  await page.getByLabel("Ingredient name").first().fill("tomatoes");
  await page.getByLabel("Step 1").fill("Simmer.");
}

test("fills, reorders and creates a recipe, then lands on it", async ({ page }) => {
  await stubSignedInShell(page);
  const posted = await stubRecipes(page, 201);

  await page.goto("/");
  await page.getByRole("button", { name: "New recipe" }).first().click();
  await expect(page).toHaveURL(/\/recipes\/new$/);

  await page.getByLabel("Title").fill("  Tomato soup ");
  await page.getByLabel("Description").fill("Weeknight soup");
  await page.getByLabel("Source").fill("Grandma");
  await page.getByLabel("Servings").fill("4");
  await page.getByLabel("Prep (min)").fill("10");
  await page.getByLabel("Cook (min)").fill("25");

  await page.getByLabel("Ingredient name").first().fill("basil");
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByLabel("Ingredient name").nth(1).fill("tomatoes");
  await page.getByLabel("Quantity").nth(1).fill("2");
  await page.getByLabel("Unit").nth(1).fill("cans");
  await page.getByLabel("Note").nth(1).fill("crushed");
  await page.getByRole("button", { name: "Move ingredient up" }).nth(1).click();

  await page.getByLabel("Step 1").fill("Simmer.");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Step 2").fill("Open the cans.");
  await page.getByRole("button", { name: "Move step up" }).nth(1).click();

  await page.getByRole("button", { name: "Create recipe" }).click();

  await expect(page).toHaveURL(new RegExp(`/recipes/${CREATED_ID}$`));
  await expect(toast(page, "Recipe created.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tomato soup" })).toBeVisible();
  await expect(page.getByText("Open the cans.")).toBeVisible();
  expect(posted).toEqual([
    {
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
    },
  ]);
});

test("an amount it can't read, or one with no ingredient, stops the save instead of being dropped", async ({ page }) => {
  await stubSignedInShell(page);
  const posted = await stubRecipes(page, 201);

  await page.goto("/recipes/new");
  await fillRequired(page);
  await page.getByLabel("Quantity").first().fill("1/2");
  await page.getByRole("button", { name: "Create recipe" }).click();

  await expect(toast(page, "Enter the amount as a number, like 2 or 0.5.")).toBeVisible();
  await expect(page).toHaveURL(/\/recipes\/new$/);

  await page.getByLabel("Quantity").first().fill("0.5");
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByLabel("Quantity").nth(1).fill("2");
  await page.getByRole("button", { name: "Create recipe" }).click();

  await expect(toast(page, "Name this ingredient, or remove it.")).toBeVisible();
  await expect(page).toHaveURL(/\/recipes\/new$/);
  expect(posted).toHaveLength(0);

  await page.getByRole("button", { name: "Remove ingredient" }).nth(1).click();
  await page.getByRole("button", { name: "Create recipe" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${CREATED_ID}$`));
  expect(posted).toEqual([expect.objectContaining({ ingredients: [expect.objectContaining({ name: "tomatoes", quantity: 0.5 })] })]);
});

test("a server error keeps everything typed so it can be sent again", async ({ page }) => {
  await stubSignedInShell(page);
  const posted = await stubRecipes(page, 500);

  await page.goto("/recipes/new");
  await fillRequired(page);
  await page.getByRole("button", { name: "Create recipe" }).click();

  await expect(toast(page, "Couldn't create this recipe — please try again.")).toBeVisible();
  await expect(page).toHaveURL(/\/recipes\/new$/);
  await expect(page.getByLabel("Title")).toHaveValue("Tomato soup");
  await expect(page.getByLabel("Ingredient name").first()).toHaveValue("tomatoes");
  await expect(page.getByLabel("Step 1")).toHaveValue("Simmer.");
  await expect(page.getByRole("button", { name: "Create recipe" })).toBeEnabled();
  expect(posted).toHaveLength(1);
});

test.describe("in a comma-decimal locale", () => {
  test.use({ locale: "de-DE" });

  test("reads amounts and minutes with a comma, and refuses a dot rather than guess", async ({ page }) => {
    await stubSignedInShell(page);
    const posted = await stubRecipes(page, 201);
    const hint = "Use a comma for decimals, like 1,25, and no thousands separators, like 1250.";

    await page.goto("/recipes/new");
    await fillRequired(page);
    for (const typed of ["0.500", "1.250"]) {
      await page.getByLabel("Quantity").first().fill(typed);
      await page.getByRole("button", { name: "Create recipe" }).click();
      await expect(toast(page, hint).first()).toBeVisible();
    }
    expect(posted).toHaveLength(0);

    await page.getByLabel("Quantity").first().fill("0,500");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByLabel("Ingredient name").nth(1).fill("water");
    await page.getByLabel("Quantity").nth(1).fill("1250");
    await page.getByLabel("Prep (min)").fill("7,5");
    await page.getByRole("button", { name: "Create recipe" }).click();

    await expect(page).toHaveURL(new RegExp(`/recipes/${CREATED_ID}$`));
    expect(posted).toEqual([
      expect.objectContaining({
        prep_minutes: 8,
        ingredients: [
          expect.objectContaining({ name: "tomatoes", quantity: 0.5 }),
          expect.objectContaining({ name: "water", quantity: 1250 }),
        ],
      }),
    ]);
  });

  test("a tweak shows the stored amounts with a comma and saves them unchanged", async ({ page }) => {
    await stubSignedInShell(page);
    const existing = createdRecipe({
      title: "Tomato soup",
      prep_minutes: 15,
      ingredients: [
        { name: "salt", quantity: 0.5, unit: "tsp" },
        { name: "butter", quantity: 2.125, unit: "cups" },
        { name: "water", quantity: 1250, unit: "ml" },
      ],
      steps: [{ instruction: "Simmer." }],
    });
    const tweaks: Array<Record<string, unknown>> = [];
    await page.route(new RegExp(`/api/recipes/${CREATED_ID}(/.*)?(\\?.*)?$`), (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === "POST" && path.endsWith("/versions")) {
        tweaks.push(route.request().postDataJSON() as Record<string, unknown>);
        return route.fulfill(json({ ...existing.latest_version, id: "v2", version_number: 2 }, 201));
      }
      if (path.endsWith(`/recipes/${CREATED_ID}`)) return route.fulfill(json(existing));
      return route.fulfill(json([]));
    });

    await page.goto(`/recipes/${CREATED_ID}/tweak`);
    await expect(page.getByLabel("Quantity").nth(0)).toHaveValue("0,5");
    await expect(page.getByLabel("Quantity").nth(1)).toHaveValue("2,125");
    await expect(page.getByLabel("Quantity").nth(2)).toHaveValue("1250");
    await expect(page.getByLabel("Prep (min)")).toHaveValue("15");

    await page.getByLabel("What did you change?").fill("Nothing, just checking");
    await page.getByRole("button", { name: "Save new version" }).click();

    await expect(page).toHaveURL(new RegExp(`/recipes/${CREATED_ID}$`));
    expect(tweaks).toEqual([
      expect.objectContaining({
        prep_minutes: 15,
        ingredients: [
          expect.objectContaining({ name: "salt", quantity: 0.5, lineage_key: "l0" }),
          expect.objectContaining({ name: "butter", quantity: 2.125, lineage_key: "l1" }),
          expect.objectContaining({ name: "water", quantity: 1250, lineage_key: "l2" }),
        ],
      }),
    ]);
  });
});
