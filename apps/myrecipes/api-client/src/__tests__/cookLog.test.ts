import { describe, expect, it } from "vitest";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import { COOK_NOTES_MAX_LENGTH } from "../constants/cookLog";
import type { CookLogResponse } from "../types/recipe/cook-log";
import { buildCookLogCreateRequest } from "../utils/buildCookLogCreateRequest";
import { cookNotesProblem } from "../utils/cookNotesProblem";
import { cooksNewestFirst } from "../utils/cooksNewestFirst";

function cook(id: string, cookedAt: string): CookLogResponse {
  return { id, version_id: "v1", cooked_at: cookedAt, rating: null, outcome_notes: null, created_at: cookedAt };
}

describe("buildCookLogCreateRequest", () => {
  it("sends the rating and trimmed notes", () => {
    expect(buildCookLogCreateRequest({ rating: 4, notes: "  More garlic " })).toEqual({ rating: 4, outcome_notes: "More garlic" });
  });

  it("sends null for no rating and blank notes", () => {
    expect(buildCookLogCreateRequest({ rating: null, notes: "   " })).toEqual({ rating: null, outcome_notes: null });
  });
});

describe("cookNotesProblem", () => {
  it("allows notes up to the backend's limit, counted trimmed", () => {
    expect(cookNotesProblem(` ${"n".repeat(COOK_NOTES_MAX_LENGTH)} `)).toBeUndefined();
  });

  it("says when notes are too long", () => {
    const long = "n".repeat(COOK_NOTES_MAX_LENGTH + 1);
    expect(cookNotesProblem(long)).toBe(tooLongProblem(long, COOK_NOTES_MAX_LENGTH));
  });
});

describe("cooksNewestFirst", () => {
  it("orders by when it was cooked, newest first, without changing the input", () => {
    const cooks = [cook("a", "2026-11-01T00:00:00Z"), cook("b", "2026-11-10T00:00:00Z"), cook("c", "2026-11-05T00:00:00Z")];
    expect(cooksNewestFirst(cooks).map(({ id }) => id)).toEqual(["b", "c", "a"]);
    expect(cooks.map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });
});
