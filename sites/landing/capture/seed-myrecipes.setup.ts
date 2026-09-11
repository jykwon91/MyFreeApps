/**
 * Seeds fake, fictional demo data into a locally running MyRecipes instance
 * so portfolio screenshots have something believable to show.
 *
 * Everything here is FAKE — a fictional user ("Alex Rivera"), fictional
 * recipes, fictional cook logs. Nothing is real cooking advice or a real
 * person. This script only ever talks to a LOCAL dev instance (default
 * http://localhost:5192) seeded into its own throwaway Postgres database
 * (portfolio_demo_myrecipes) — never a deployed environment.
 *
 * Idempotent: safe to run repeatedly. It detects the existing demo account
 * and existing recipes/versions/cook logs by title / version_number / count
 * and only creates what's missing.
 *
 * Run from sites/landing:
 *   npx playwright test --config capture/playwright.config.ts --project=seed seed-myrecipes
 */
import { test as setup, expect, type APIRequestContext } from "@playwright/test";

import { DEMO_EMAIL, DEMO_NAME, DEMO_PASSWORD } from "./fixtures/demo-user";
import { markEmailVerified } from "./local-db";
import {
  heroRecipe,
  heroVersionDeltas,
  heroCookLogsByVersion,
  otherRecipes,
  otherRecipeCookLogs,
  type IngredientFixture,
  type RecipeFixture,
  type CookLogFixture,
} from "./fixtures/myrecipes/recipes";

const BASE_URL = process.env.MYRECIPES_URL ?? "http://localhost:5192";
const API = `${BASE_URL}/api`;

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function ensureDemoAccount(request: APIRequestContext): Promise<void> {
  const registerResponse = await request.post(`${API}/auth/register`, {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD, display_name: DEMO_NAME },
  });

  if (registerResponse.status() === 201) {
    console.log(`[seed-myrecipes] created demo account ${DEMO_EMAIL}`);
  } else if (registerResponse.status() === 400) {
    console.log(`[seed-myrecipes] demo account ${DEMO_EMAIL} already exists — reusing it`);
  } else {
    throw new Error(
      `Unexpected /auth/register response: ${registerResponse.status()} ${await registerResponse.text()}`,
    );
  }

  // Idempotent no-op if already verified.
  markEmailVerified("myrecipes", DEMO_EMAIL);
}

async function loginDemoAccount(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API}/auth/totp/login`, {
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  if (!body.access_token) {
    throw new Error(`Login did not return an access_token: ${JSON.stringify(body)}`);
  }
  return body.access_token as string;
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

interface VersionIngredient {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
  lineage_key: string;
}

interface VersionResponse {
  id: string;
  version_number: number;
  ingredients: VersionIngredient[];
  steps: { instruction: string }[];
}

interface RecipeDetailResponse {
  id: string;
  title: string;
  latest_version: VersionResponse | null;
}

function toApiIngredients(items: IngredientFixture[]) {
  return items.map((i) => ({
    name: i.name,
    quantity: i.quantity ?? null,
    unit: i.unit ?? null,
    note: i.note ?? null,
  }));
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Find an existing recipe owned by the demo user by exact title match. */
async function findOwnedRecipeByTitle(
  request: APIRequestContext,
  token: string,
  title: string,
): Promise<RecipeDetailResponse | null> {
  const response = await request.get(
    `${API}/recipes?owner=me&search=${encodeURIComponent(title)}&limit=200`,
    { headers: authHeaders(token) },
  );
  expect(response.status(), await response.text()).toBe(200);
  const summaries = (await response.json()) as { id: string; title: string }[];
  const match = summaries.find((r) => r.title === title);
  if (!match) return null;
  const detail = await request.get(`${API}/recipes/${match.id}`, { headers: authHeaders(token) });
  expect(detail.status()).toBe(200);
  return (await detail.json()) as RecipeDetailResponse;
}

async function createRecipe(
  request: APIRequestContext,
  token: string,
  fixture: RecipeFixture,
): Promise<RecipeDetailResponse> {
  const response = await request.post(`${API}/recipes`, {
    headers: authHeaders(token),
    data: {
      title: fixture.title,
      description: fixture.description ?? null,
      source: fixture.source ?? null,
      servings: fixture.servings ?? null,
      prep_minutes: fixture.prepMinutes ?? null,
      cook_minutes: fixture.cookMinutes ?? null,
      ingredients: toApiIngredients(fixture.ingredients),
      steps: fixture.steps.map((instruction) => ({ instruction })),
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as RecipeDetailResponse;
}

/** Create the recipe if it doesn't already exist for the demo user. */
async function ensureRecipe(
  request: APIRequestContext,
  token: string,
  fixture: RecipeFixture,
): Promise<RecipeDetailResponse> {
  const existing = await findOwnedRecipeByTitle(request, token, fixture.title);
  if (existing) {
    console.log(`[seed-myrecipes] recipe "${fixture.title}" already exists — reusing it`);
    return existing;
  }
  const created = await createRecipe(request, token, fixture);
  console.log(`[seed-myrecipes] created recipe "${fixture.title}"`);
  return created;
}

/** Apply the hero recipe's version-history story up to v4, resuming from whatever version_number already exists. */
async function ensureHeroVersions(
  request: APIRequestContext,
  token: string,
  recipe: RecipeDetailResponse,
): Promise<void> {
  let current = recipe.latest_version;
  if (!current) throw new Error("Hero recipe has no latest_version — cannot build tweaks on top of it.");

  let ingredients = current.ingredients.map((i) => ({
    name: i.name,
    quantity: i.quantity ?? undefined,
    unit: i.unit ?? undefined,
    note: i.note ?? undefined,
    lineage_key: i.lineage_key,
  }));
  let steps = current.steps.map((s) => s.instruction);

  for (const delta of heroVersionDeltas) {
    if (current.version_number >= delta.versionNumber) {
      // Already applied in a previous run — but keep the working state in
      // sync in case a later delta needs it.
      continue;
    }

    for (const edit of delta.ingredientEdits) {
      const target = ingredients[edit.index];
      if (!target) throw new Error(`ingredientEdits[index=${edit.index}] out of range for hero v1 ingredients`);
      if (edit.name !== undefined) target.name = edit.name;
      if (edit.quantity !== undefined) target.quantity = edit.quantity;
      if (edit.unit !== undefined) target.unit = edit.unit;
      if (edit.note !== undefined) target.note = edit.note;
    }
    const newIngredients = [
      ...ingredients,
      ...delta.ingredientAdds.map((a) => ({
        name: a.name,
        quantity: a.quantity,
        unit: a.unit,
        note: a.note,
        lineage_key: undefined as string | undefined,
      })),
    ];

    const newSteps = [...steps];
    for (const edit of delta.stepEdits) {
      if (edit.index < 0 || edit.index >= newSteps.length) {
        throw new Error(`stepEdits[index=${edit.index}] out of range for hero steps`);
      }
      newSteps[edit.index] = edit.instruction;
    }

    const response = await request.post(`${API}/recipes/${recipe.id}/versions`, {
      headers: authHeaders(token),
      data: {
        base_version_id: current.id,
        change_note: delta.changeNote,
        servings: heroRecipe.servings ?? null,
        prep_minutes: heroRecipe.prepMinutes ?? null,
        cook_minutes: heroRecipe.cookMinutes ?? null,
        ingredients: newIngredients.map((i) => ({
          name: i.name,
          quantity: i.quantity ?? null,
          unit: i.unit ?? null,
          note: i.note ?? null,
          lineage_key: i.lineage_key ?? null,
        })),
        steps: newSteps.map((instruction) => ({ instruction })),
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    const created = (await response.json()) as VersionResponse;
    console.log(
      `[seed-myrecipes] hero recipe: created v${created.version_number} ("${delta.changeNote.slice(0, 50)}...")`,
    );

    current = created;
    ingredients = created.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity ?? undefined,
      unit: i.unit ?? undefined,
      note: i.note ?? undefined,
      lineage_key: i.lineage_key,
    }));
    steps = created.steps.map((s) => s.instruction);
  }
}

/** Log a cook for a given version, skipping if that many cook logs already exist on it. */
async function ensureCookLogsForVersion(
  request: APIRequestContext,
  token: string,
  recipeId: string,
  versionId: string,
  planned: CookLogFixture[],
): Promise<void> {
  if (planned.length === 0) return;
  const existingResponse = await request.get(
    `${API}/recipes/${recipeId}/versions/${versionId}/cooks`,
    { headers: authHeaders(token) },
  );
  expect(existingResponse.status(), await existingResponse.text()).toBe(200);
  const existing = (await existingResponse.json()) as unknown[];

  if (existing.length >= planned.length) {
    console.log(
      `[seed-myrecipes] version ${versionId} already has ${existing.length} cook log(s) — skipping`,
    );
    return;
  }

  for (const cook of planned.slice(existing.length)) {
    const cookedAt = new Date(Date.now() - cook.daysAgo * 24 * 60 * 60 * 1000).toISOString();
    const response = await request.post(
      `${API}/recipes/${recipeId}/versions/${versionId}/cooks`,
      {
        headers: authHeaders(token),
        data: { cooked_at: cookedAt, rating: cook.rating, outcome_notes: cook.outcomeNotes },
      },
    );
    expect(response.status(), await response.text()).toBe(201);
  }
  console.log(
    `[seed-myrecipes] logged ${planned.length - existing.length} cook(s) for version ${versionId}`,
  );
}

// ---------------------------------------------------------------------------
// Setup test
// ---------------------------------------------------------------------------

setup("seed MyRecipes demo data", async ({ request }) => {
  await ensureDemoAccount(request);
  const token = await loginDemoAccount(request);

  // Hero recipe + its 4-version story.
  const hero = await ensureRecipe(request, token, heroRecipe);
  await ensureHeroVersions(request, token, hero);

  // Re-fetch versions so we have every version id for cook-log seeding,
  // regardless of whether this run created them or a previous run did.
  const versionsResponse = await request.get(`${API}/recipes/${hero.id}/versions`, {
    headers: authHeaders(token),
  });
  expect(versionsResponse.status()).toBe(200);
  const heroVersions = (await versionsResponse.json()) as { id: string; version_number: number }[];
  for (const version of heroVersions) {
    const planned = heroCookLogsByVersion[version.version_number] ?? [];
    await ensureCookLogsForVersion(request, token, hero.id, version.id, planned);
  }

  // The rest of the library — single-version recipes.
  for (const fixture of otherRecipes) {
    const recipe = await ensureRecipe(request, token, fixture);
    const planned = otherRecipeCookLogs[fixture.title];
    if (planned && recipe.latest_version) {
      await ensureCookLogsForVersion(request, token, recipe.id, recipe.latest_version.id, [planned]);
    }
  }

  console.log(`[seed-myrecipes] done — demo account ${DEMO_EMAIL} ready at ${BASE_URL}`);
});
