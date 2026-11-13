/**
 * Stubs creating a recipe: POST /recipes answers `status` (201 stores the recipe built from the
 * posted body, anything else is a refusal that stores nothing). From then on the recipe is
 * listed by GET /recipes and served by stubRecipeRoutes; until then reads of it are the
 * unmatched 404. Returns every body the page posted.
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { RecipeCreateRequest } from "@myrecipes/api-client/types/recipe/recipe-requests";
import { detailFromCreateRequest } from "./recipeFixtures";
import { RECIPES_COLLECTION_ROUTE } from "./recipeRoutes";
import { stubRecipeRoutes } from "./stubRecipeApi";

export async function stubRecipeCreate(page: Page, recipeId: string, status = 201): Promise<RecipeCreateRequest[]> {
  const posted: RecipeCreateRequest[] = [];
  let created: RecipeDetailResponse | null = null;
  await page.route(RECIPES_COLLECTION_ROUTE, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      if (!created) return route.fulfill(json([]));
      const { latest_version: _latest, ...summary } = created;
      return route.fulfill(json([summary]));
    }
    if (request.method() !== "POST") return route.fallback();
    const body = request.postDataJSON() as RecipeCreateRequest;
    posted.push(body);
    if (status !== 201) return route.fulfill(json({ detail: "boom" }, status));
    created = detailFromCreateRequest(recipeId, body);
    await stubRecipeRoutes(page, recipeId, { recipe: created });
    return route.fulfill(json(created, 201));
  });
  return posted;
}
