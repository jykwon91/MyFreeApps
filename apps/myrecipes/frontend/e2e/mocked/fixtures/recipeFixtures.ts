/** Recipe response builders shared by the no-backend specs that need a stored recipe. */
import type { RecipeDetailResponse, RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import type { RecipeCreateRequest } from "@myrecipes/api-client/types/recipe/recipe-requests";
import type { VersionResponse, VersionSummary } from "@myrecipes/api-client/types/recipe/version";
import type { CookLogResponse } from "@myrecipes/api-client/types/recipe/cook-log";
import { TEST_USER } from "@platform/ui/test-support/mockSession";

export const NOW = "2026-11-11T00:00:00Z";

const VERSION_GROUP = 1;
const COOK_GROUP = 2;
const LINEAGE_GROUP = 3;
const INGREDIENT_GROUP = 4;
const STEP_GROUP = 5;
const RECIPE_GROUP = 6;

/** A well-formed UUID that is the same on every run; the backend types every id as uuid.UUID. */
function fixtureId(group: number, index: number): string {
  return `${group.toString(16).padStart(8, "0")}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

export const versionIdOf = (versionNumber: number): string => fixtureId(VERSION_GROUP, versionNumber);
export const VERSION_1_ID = versionIdOf(1);
export const VERSION_2_ID = versionIdOf(2);
export const COOK_ID = fixtureId(COOK_GROUP, 1);
/** Ids for cooks logged during a test (numbered from 1), kept clear of the seeded ones. */
const LOGGED_COOK_OFFSET = 1000;
export const loggedCookIdAt = (n: number): string => fixtureId(COOK_GROUP, LOGGED_COOK_OFFSET + n);
export const recipeIdAt = (index: number): string => fixtureId(RECIPE_GROUP, index);
/** The lineage key of the ingredient at this position in a fixture version. */
export const lineageKeyAt = (index: number): string => fixtureId(LINEAGE_GROUP, index + 1);
export const TOMATOES_LINEAGE_KEY = lineageKeyAt(0);
export const SALT_LINEAGE_KEY = lineageKeyAt(1);
/** Rows are copied into each version, so their ids are per version while the lineage key carries over. */
const ROWS_PER_VERSION = 100;
export const ingredientIdOf = (versionNumber: number, index: number): string =>
  fixtureId(INGREDIENT_GROUP, versionNumber * ROWS_PER_VERSION + index + 1);
export const stepIdOf = (versionNumber: number, index: number): string =>
  fixtureId(STEP_GROUP, versionNumber * ROWS_PER_VERSION + index + 1);

export function versionOf(recipeId: string, versionNumber = 1, overrides: Partial<VersionResponse> = {}): VersionResponse {
  return {
    id: versionIdOf(versionNumber),
    recipe_id: recipeId,
    version_number: versionNumber,
    parent_version_id: versionNumber === 1 ? null : versionIdOf(versionNumber - 1),
    change_note: null,
    servings: "4",
    prep_minutes: 10,
    cook_minutes: 25,
    created_at: NOW,
    ingredients: [
      { id: ingredientIdOf(versionNumber, 0), lineage_key: TOMATOES_LINEAGE_KEY, position: 0, name: "tomatoes", quantity: 2, unit: "cans", note: null },
      { id: ingredientIdOf(versionNumber, 1), lineage_key: SALT_LINEAGE_KEY, position: 1, name: "salt", quantity: 1, unit: "tsp", note: null },
    ],
    steps: [{ id: stepIdOf(versionNumber, 0), position: 0, instruction: "Simmer." }],
    ...overrides,
  };
}

export function summaryOf(id: string, title: string, overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id,
    title,
    description: null,
    source: null,
    created_at: NOW,
    updated_at: NOW,
    version_count: 1,
    latest_version_number: 1,
    best_rating: null,
    last_cooked_at: null,
    is_owner: true,
    owner_display_name: TEST_USER.display_name,
    ...overrides,
  };
}

export function detailOf(id: string, overrides: Partial<RecipeDetailResponse> = {}): RecipeDetailResponse {
  return {
    ...summaryOf(id, "Tomato soup", { description: "Weeknight soup", source: "Grandma" }),
    latest_version: versionOf(id),
    ...overrides,
  };
}

/** The recipe the server stores for a create request: its first version holds the posted rows, in order. */
export function detailFromCreateRequest(id: string, body: RecipeCreateRequest): RecipeDetailResponse {
  const version = versionOf(id, 1, {
    servings: body.servings ?? null,
    prep_minutes: body.prep_minutes ?? null,
    cook_minutes: body.cook_minutes ?? null,
    ingredients: body.ingredients.map((ingredient, index) => ({
      id: ingredientIdOf(1, index),
      lineage_key: lineageKeyAt(index),
      position: index,
      name: ingredient.name,
      quantity: ingredient.quantity ?? null,
      unit: ingredient.unit ?? null,
      note: ingredient.note ?? null,
    })),
    steps: body.steps.map((step, index) => ({
      id: stepIdOf(1, index),
      position: index,
      instruction: step.instruction,
    })),
  });
  return detailOf(id, {
    title: body.title,
    description: body.description ?? null,
    source: body.source ?? null,
    latest_version: version,
  });
}

/** A timeline entry; the cook rollups are the owner's, so null unless `cooks` (the recipe's logs) is given. */
export function versionSummaryOf(version: VersionResponse, cooks: CookLogResponse[] | null = null): VersionSummary {
  const own = cooks?.filter((cook) => cook.version_id === version.id) ?? null;
  return {
    id: version.id,
    version_number: version.version_number,
    change_note: version.change_note,
    created_at: version.created_at,
    cook_count: own ? own.length : null,
    best_rating: own ? bestRatingOf(own) : null,
  };
}

export function bestRatingOf(cooks: CookLogResponse[]): number | null {
  const ratings = cooks.flatMap((cook) => (cook.rating === null ? [] : [cook.rating]));
  return ratings.length > 0 ? Math.max(...ratings) : null;
}

export function cookOf(overrides: Partial<CookLogResponse> = {}): CookLogResponse {
  return {
    id: COOK_ID,
    version_id: VERSION_1_ID,
    cooked_at: NOW,
    rating: 4,
    outcome_notes: "Needed more salt",
    created_at: NOW,
    ...overrides,
  };
}
