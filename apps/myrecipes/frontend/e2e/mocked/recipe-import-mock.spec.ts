/**
 * No-backend E2E for /recipes/import: a signed-in user picks a photo, it's read
 * into the editor for review, and creating it lands on the new recipe; a failed
 * read says why (the copy shared with the phone) and goes back to picking.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "@platform/ui/testing/mockResponse";
import { stubSignedInShell, TEST_USER } from "@platform/ui/testing/mockSession";
import { recipeIdAt } from "./fixtures/recipeFixtures";

const CREATED_ID = recipeIdAt(2);
const DRAFT = {
  title: "Grandma's tomato soup",
  description: null,
  source: "Grandma's recipe box",
  servings: "4",
  prep_minutes: 10,
  cook_minutes: 25,
  ingredients: [{ name: "tomatoes", quantity: 2, unit: "cans", note: null }],
  steps: [{ instruction: "Simmer." }],
};
// A 1x1 PNG: the picker only checks the type and size, and the read is stubbed.
const PHOTO = {
  name: "card.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
};

/** POST /recipes/extract answers each status in turn; POST /recipes creates from what was posted. */
async function stubImport(page: Page, extractStatuses: number[]) {
  const extracts: string[] = [];
  const posted: Array<Record<string, unknown>> = [];
  await page.route(/\/api\/recipes\/extract$/, (route) => {
    extracts.push(route.request().headers()["content-type"] ?? "");
    const status = extractStatuses[extracts.length - 1] ?? 200;
    return route.fulfill(status === 200 ? json(DRAFT) : json({ detail: "no" }, status));
  });
  await page.route(/\/api\/recipes(\?|$)/, (route) => {
    if (route.request().method() !== "POST") return route.fulfill(json([]));
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posted.push(body);
    return route.fulfill(
      json(
        {
          id: CREATED_ID,
          title: body.title,
          description: null,
          source: body.source,
          created_at: "2026-11-11T00:00:00Z",
          updated_at: "2026-11-11T00:00:00Z",
          version_count: 1,
          latest_version_number: 1,
          is_owner: true,
          owner_display_name: TEST_USER.display_name,
          best_rating: null,
          last_cooked_at: null,
          latest_version: null,
        },
        201,
      ),
    );
  });
  await page.route(new RegExp(`/api/recipes/${CREATED_ID}(/.*)?(\\?.*)?$`), (route) => route.fulfill(json({ detail: "Not Found" }, 404)));
  return { extracts, posted };
}

async function pickPhoto(page: Page) {
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(page.getByAltText(`Preview of ${PHOTO.name}`)).toBeVisible();
}

test("reads a photo into the editor, then creates the recipe from it", async ({ page }) => {
  await stubSignedInShell(page);
  const { extracts, posted } = await stubImport(page, [200]);

  await page.goto("/");
  await page.getByRole("button", { name: "Import from photo" }).click();
  await expect(page).toHaveURL(/\/recipes\/import$/);

  await pickPhoto(page);
  await page.getByRole("button", { name: "Extract recipe" }).click();

  await expect(page.getByLabel(/^Title/)).toHaveValue(DRAFT.title);
  await expect(page.getByLabel("Source")).toHaveValue(DRAFT.source);
  await expect(page.getByLabel("Ingredient name").first()).toHaveValue("tomatoes");
  expect(extracts).toEqual([expect.stringContaining("multipart/form-data")]);

  await page.getByRole("button", { name: "Create recipe" }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${CREATED_ID}$`));
  expect(posted).toEqual([expect.objectContaining({ title: DRAFT.title, source: DRAFT.source, prep_minutes: 10 })]);
});

test("a failed read says why and goes back to picking a photo", async ({ page }) => {
  await stubSignedInShell(page);
  const { extracts } = await stubImport(page, [429, 422, 200]);

  await page.goto("/recipes/import");
  await pickPhoto(page);
  await page.getByRole("button", { name: "Extract recipe" }).click();
  await expect(page.getByText("You've imported a lot of photos recently. Give it a few minutes and try again.")).toBeVisible();

  await pickPhoto(page);
  await page.getByRole("button", { name: "Extract recipe" }).click();
  await expect(page.getByText("We couldn't read a recipe from that photo. Try a clearer or better-lit photo.")).toBeVisible();

  await pickPhoto(page);
  await page.getByRole("button", { name: "Extract recipe" }).click();
  await expect(page.getByLabel(/^Title/)).toHaveValue(DRAFT.title);
  expect(extracts).toHaveLength(3);
});
