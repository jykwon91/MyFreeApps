/**
 * Stubs one owned (or someone else's) recipe's API the way the backend answers
 * it (apps/myrecipes/backend/app/api/recipes.py): reads come from state that
 * the writes change, the cook-log endpoints are 404 to a non-owner, a deleted
 * recipe is 404 everywhere, and logging or deleting a cook moves the timeline's
 * cook_count and best_rating on the next read. Writes are owner-only (404 to
 * anyone else) and bodies are checked like the pydantic request schemas
 * (extra keys, empty title and out-of-range rating are 422).
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/testing/mockResponse";
import type { CookLogCreateRequest, CookLogResponse } from "@myrecipes/api-client/types/recipe/cook-log";
import type { RecipeDetailResponse } from "@myrecipes/api-client/types/recipe/recipe";
import type { RecipeUpdateRequest } from "@myrecipes/api-client/types/recipe/recipe-requests";
import type { RecipeApiLog } from "../types/RecipeApiLog";
import type { RecipeApiStubOptions } from "../types/RecipeApiStubOptions";
import { NOW, loggedCookIdAt, bestRatingOf, detailOf, versionOf, versionSummaryOf } from "./recipeFixtures";

const NOT_FOUND = { detail: "Not Found" };
const VERSION_PATH = /^\/versions\/([^/]+)(\/cooks)?$/;
const COOK_PATH = /^\/cooks\/([^/]+)$/;
const COOKS_OF_VERSION_PATH = /^\/versions\/([^/]+)\/cooks$/;

// Mirrors RecipeUpdateRequest and CookLogCreateRequest (backend/app/schemas/recipe), both extra="forbid".
const UPDATE_FIELDS = ["title", "description", "source"];
const COOK_FIELDS = ["cooked_at", "rating", "outcome_notes"];
const TITLE_MAX = 255;
const DESCRIPTION_MAX = 5000;
const SOURCE_MAX = 1000;
const RATING_MIN = 1;
const RATING_MAX = 5;
const OUTCOME_NOTES_MAX = 2000;

function tooLong(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length > max;
}

/** Why the server would answer 422 to this body, or null when it accepts it. */
function updateProblem(body: Record<string, unknown>): string | null {
  const extra = Object.keys(body).find((key) => !UPDATE_FIELDS.includes(key));
  if (extra) return `extra field not permitted: ${extra}`;
  if (typeof body.title === "string" && body.title.length === 0) return "title must not be empty";
  if (tooLong(body.title, TITLE_MAX) || tooLong(body.description, DESCRIPTION_MAX) || tooLong(body.source, SOURCE_MAX)) {
    return "value too long";
  }
  return null;
}

function cookProblem(body: Record<string, unknown>): string | null {
  const extra = Object.keys(body).find((key) => !COOK_FIELDS.includes(key));
  if (extra) return `extra field not permitted: ${extra}`;
  const { rating } = body;
  if (rating !== undefined && rating !== null && (typeof rating !== "number" || !Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX)) {
    return `rating must be ${RATING_MIN} to ${RATING_MAX}`;
  }
  if (tooLong(body.outcome_notes, OUTCOME_NOTES_MAX)) return "outcome_notes too long";
  return null;
}

function lastCookedAt(cooks: CookLogResponse[]): string | null {
  const times = cooks.map((cook) => cook.cooked_at).sort();
  return times.length > 0 ? times[times.length - 1]! : null;
}

function validationProblem(method: string, suffix: string, body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const fields = body as Record<string, unknown>;
  if (method === "PATCH" && suffix === "") return updateProblem(fields);
  if (method === "POST" && VERSION_PATH.exec(suffix)?.[2]) return cookProblem(fields);
  return null;
}

export async function stubRecipeApi(
  page: Page,
  recipeId: string,
  { isOwner = true, versionCount = 1, cooks = [], failWith = {} }: RecipeApiStubOptions = {},
): Promise<RecipeApiLog> {
  const versions = Array.from({ length: versionCount }, (_, index) =>
    versionOf(recipeId, index + 1, index === 0 ? {} : { change_note: `Change ${index + 1}` }),
  );
  const latest = versions[versions.length - 1]!;
  let recipe: RecipeDetailResponse = detailOf(recipeId, {
    is_owner: isOwner,
    latest_version: latest,
    version_count: versionCount,
    latest_version_number: versionCount,
  });
  let cookLogs = [...cooks];
  let deleted = false;
  let loggedCooks = 0;
  const log: RecipeApiLog = { writes: [], reads: [] };

  /** The recipe as the server sends it: cook rollups are the owner's. */
  const current = (): RecipeDetailResponse =>
    isOwner ? { ...recipe, best_rating: bestRatingOf(cookLogs), last_cooked_at: lastCookedAt(cookLogs) } : recipe;

  await page.route(/\/api\/recipes(\?|$)/, (route) => {
    const { latest_version: _latest, ...summary } = current();
    return route.fulfill(json(deleted ? [] : [summary]));
  });

  await page.route(new RegExp(`/api/recipes/${recipeId}(/.*)?(\\?.*)?$`), (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.replace("/api", "");
    const suffix = path.replace(`/recipes/${recipeId}`, "");
    const notFound = () => route.fulfill(json(NOT_FOUND, 404));

    if (method !== "GET") {
      const body = method === "DELETE" ? null : (request.postDataJSON() as unknown);
      log.writes.push({ method, path, body });
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
      const cookId = COOK_PATH.exec(suffix)?.[1];
      if (method === "DELETE" && cookId) {
        if (!cookLogs.some((cook) => cook.id === cookId)) return notFound();
        cookLogs = cookLogs.filter((cook) => cook.id !== cookId);
        return route.fulfill({ status: 204 });
      }
      const [, versionId, cooksSegment] = VERSION_PATH.exec(suffix) ?? [];
      if (method === "POST" && versionId && cooksSegment) {
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
    if (suffix === "/versions") {
      return route.fulfill(json(versions.map((version) => versionSummaryOf(version, isOwner ? cookLogs : null))));
    }
    if (suffix === "/cooks") return isOwner ? route.fulfill(json(cookLogs)) : notFound();
    const cooksOfVersion = COOKS_OF_VERSION_PATH.exec(suffix)?.[1];
    if (cooksOfVersion) {
      return isOwner ? route.fulfill(json(cookLogs.filter((cook) => cook.version_id === cooksOfVersion))) : notFound();
    }
    const versionId = VERSION_PATH.exec(suffix)?.[1];
    const version = versions.find((candidate) => candidate.id === versionId);
    // The diff endpoint is not read by this page, so it is left unstubbed (404) rather than faked.
    return version ? route.fulfill(json(version)) : notFound();
  });

  return log;
}
