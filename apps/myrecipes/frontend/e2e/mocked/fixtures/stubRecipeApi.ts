/**
 * Stubs one owned (or someone else's) recipe's API the way the backend answers
 * it (apps/myrecipes/backend/app/api/recipes.py): reads come from state that
 * the writes change, the cook-log endpoints are 404 to a non-owner, a deleted
 * recipe is 404 everywhere, and logging or deleting a cook moves the timeline's
 * cook_count and best_rating on the next read. A tweak (POST .../versions)
 * appends the next version number, built on its base (the latest unless
 * base_version_id names another of the recipe's versions, else 400), and makes
 * it the latest; every version stays readable, and the diff of two versions is
 * derived from their bodies (404 for a version that isn't the recipe's, 400 for
 * an `against` that isn't). Writes are owner-only (404 to anyone else). Request
 * bodies are checked like the pydantic schemas (extra keys, empty or too long
 * values, out-of-range numbers are 422; see requestProblems).
 */
import type { Page } from "@playwright/test";
import { NOT_FOUND_BODY } from "@platform/ui/test-support/constants/notFoundBody";
import { json } from "@platform/ui/test-support/mockResponse";
import { pathUnderBase } from "@platform/ui/test-support/apiPath";
import { recordWrite } from "@platform/ui/test-support/recordWrite";
import type { CookLogCreateRequest, CookLogResponse } from "@myrecipes/api-client/types/recipe/cook-log";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { RecipeUpdateRequest, VersionCreateRequest } from "@myrecipes/api-client/types/recipe/recipe-requests";
import type { RecipeApiLog } from "../types/RecipeApiLog";
import type { RecipeApiStubOptions } from "../types/RecipeApiStubOptions";
import { cookProblem, updateProblem, versionProblem } from "./requestProblems";
import { diffVersions } from "./diffVersions";
import { RECIPES_COLLECTION_ROUTE, VERSIONS_SUFFIX, recipeRoute } from "./recipeRoutes";
import { NOW, loggedCookIdAt, bestRatingOf, detailOf, versionFromRequest, versionOf, versionSummaryOf } from "./recipeFixtures";

// /versions/:id, with /cooks (that version's cook log) or /diff after it.
const VERSION_PATH = /^\/versions\/([^/]+)(\/cooks|\/diff)?$/;
const COOKS_SEGMENT = "/cooks";
const DIFF_SEGMENT = "/diff";
// recipe_service.diff_versions message, sent as the 400 detail.
const AGAINST_REFUSED = "against version is not a version of this recipe";
// recipe_service.InvalidBaseVersionError message, sent as the 400 detail.
const BASE_VERSION_REFUSED = "base_version_id is not a version of this recipe";
const COOK_PATH = /^\/cooks\/([^/]+)$/;

function lastCookedAt(cooks: CookLogResponse[]): string | null {
  const times = cooks.map((cook) => cook.cooked_at).sort();
  return times.length > 0 ? times[times.length - 1]! : null;
}

function validationProblem(method: string, suffix: string, body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const fields = body as Record<string, unknown>;
  if (method === "PATCH" && suffix === "") return updateProblem(fields);
  if (method === "POST" && suffix === VERSIONS_SUFFIX) return versionProblem(fields);
  if (method === "POST" && VERSION_PATH.exec(suffix)?.[2] === COOKS_SEGMENT) return cookProblem(fields);
  return null;
}

/** The recipe collection (GET lists what stubRecipeRoutes holds) plus the recipe's own routes. */
export async function stubRecipeApi(page: Page, recipeId: string, options: RecipeApiStubOptions = {}): Promise<RecipeApiLog> {
  return stubRecipeRoutes(page, recipeId, options, true);
}

/**
 * The routes under /recipes/:id only. Register them when the recipe comes into
 * being (a create answering 201), so until then every read is the unmatched 404.
 */
export async function stubRecipeRoutes(
  page: Page,
  recipeId: string,
  { recipe: seed, versions: seededVersions, isOwner = seed?.is_owner ?? true, versionCount = 1, cooks = [], failWith = {} }: RecipeApiStubOptions = {},
  withCollection = false,
): Promise<RecipeApiLog> {
  const versions: VersionResponse[] =
    seededVersions ??
    (seed
      ? seed.latest_version ? [seed.latest_version] : []
      : Array.from({ length: versionCount }, (_, index) =>
          versionOf(recipeId, index + 1, index === 0 ? {} : { change_note: `Change ${index + 1}` }),
        ));
  const latestOf = () => versions[versions.length - 1]!;
  let recipe: RecipeDetailResponse = {
    ...(seed ??
      detailOf(recipeId, {
        latest_version: latestOf(),
        version_count: versions.length,
        latest_version_number: latestOf().version_number,
      })),
    is_owner: isOwner,
  };
  let cookLogs = [...cooks];
  let deleted = false;
  let loggedCooks = 0;
  const log: RecipeApiLog = { writes: [], reads: [] };

  /** The recipe as the server sends it: cook rollups are the owner's. */
  const current = (): RecipeDetailResponse =>
    isOwner ? { ...recipe, best_rating: bestRatingOf(cookLogs), last_cooked_at: lastCookedAt(cookLogs) } : recipe;

  if (withCollection) {
    await page.route(RECIPES_COLLECTION_ROUTE, (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const { latest_version: _latest, ...summary } = current();
      return route.fulfill(json(deleted ? [] : [summary]));
    });
  }

  await page.route(recipeRoute(recipeId), (route) => {
    const request = route.request();
    const method = request.method();
    const path = pathUnderBase(new URL(request.url())) ?? "";
    const suffix = path.replace(`/recipes/${recipeId}`, "");
    const notFound = () => route.fulfill(json(NOT_FOUND_BODY, 404));

    if (method !== "GET") {
      const body = recordWrite(log.writes, request);
      const problem = validationProblem(method, suffix, body);
      if (problem) return route.fulfill(json({ detail: problem }, 422));
      const failure = failWith[`${method} ${suffix || "/"}`];
      if (failure) return route.fulfill(json({ detail: "refused" }, failure));
      if (deleted || !isOwner) return notFound();

      if (method === "PATCH" && suffix === "") {
        recipe = { ...recipe, ...(body as RecipeUpdateRequest), updated_at: NOW };
        return route.fulfill(json(current()));
      }
      if (method === "DELETE" && suffix === "") {
        deleted = true;
        return route.fulfill({ status: 204 });
      }
      if (method === "POST" && suffix === VERSIONS_SUFFIX) {
        const tweak = { ingredients: [], steps: [], ...(body as Partial<VersionCreateRequest>) };
        const base = tweak.base_version_id != null ? versions.find((version) => version.id === tweak.base_version_id) : latestOf();
        if (tweak.base_version_id != null && !base) return route.fulfill(json({ detail: BASE_VERSION_REFUSED }, 400));
        // Like the backend, a field the tweak leaves out is inherited from its base; an explicit null clears it.
        const inherited = (field: "servings" | "prep_minutes" | "cook_minutes") => (field in tweak ? {} : { [field]: base?.[field] ?? null });
        const nextNumber = Math.max(0, ...versions.map((version) => version.version_number), recipe.latest_version_number ?? 0) + 1;
        const created = versionFromRequest(recipeId, nextNumber, tweak, {
          change_note: tweak.change_note ?? null,
          parent_version_id: base?.id ?? null,
          ...inherited("servings"),
          ...inherited("prep_minutes"),
          ...inherited("cook_minutes"),
        });
        versions.push(created);
        recipe = { ...recipe, latest_version: created, version_count: recipe.version_count + 1, latest_version_number: created.version_number, updated_at: NOW };
        return route.fulfill(json(created, 201));
      }
      const cookId = COOK_PATH.exec(suffix)?.[1];
      if (method === "DELETE" && cookId) {
        if (!cookLogs.some((cook) => cook.id === cookId)) return notFound();
        cookLogs = cookLogs.filter((cook) => cook.id !== cookId);
        return route.fulfill({ status: 204 });
      }
      const [, versionId, cooksSegment] = VERSION_PATH.exec(suffix) ?? [];
      if (method === "POST" && versionId && cooksSegment === COOKS_SEGMENT) {
        if (!versions.some((version) => version.id === versionId)) return notFound();
        const { rating = null, outcome_notes = null } = body as CookLogCreateRequest;
        const logged: CookLogResponse = {
          id: loggedCookIdAt(++loggedCooks),
          version_id: versionId,
          cooked_at: NOW,
          rating,
          outcome_notes,
          created_at: NOW,
        };
        cookLogs = [logged, ...cookLogs];
        return route.fulfill(json(logged, 201));
      }
      return notFound();
    }

    log.reads.push(path);
    if (deleted) return notFound();
    if (suffix === "") return route.fulfill(json(current()));
    if (suffix === VERSIONS_SUFFIX) {
      return route.fulfill(json(versions.map((version) => versionSummaryOf(version, isOwner ? cookLogs : null))));
    }
    if (suffix === COOKS_SEGMENT) return isOwner ? route.fulfill(json(cookLogs)) : notFound();
    const [, versionId, segment] = VERSION_PATH.exec(suffix) ?? [];
    const version = versions.find((candidate) => candidate.id === versionId);
    if (!version) return notFound();
    if (segment === COOKS_SEGMENT) {
      return isOwner ? route.fulfill(json(cookLogs.filter((cook) => cook.version_id === version.id))) : notFound();
    }
    if (segment === DIFF_SEGMENT) {
      const against = new URL(request.url()).searchParams.get("against");
      const from = against === null ? versions.find((candidate) => candidate.id === version.parent_version_id) : versions.find((candidate) => candidate.id === against);
      if (against !== null && !from) return route.fulfill(json({ detail: AGAINST_REFUSED }, 400));
      return route.fulfill(json(diffVersions(from ?? null, version)));
    }
    return route.fulfill(json(version));
  });

  return log;
}
