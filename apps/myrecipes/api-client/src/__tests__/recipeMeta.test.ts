import { describe, expect, it } from "vitest";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import {
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_FORM_PROBLEMS as PROBLEMS,
  RECIPE_SOURCE_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
} from "../constants/recipeForm";
import type { RecipeMetaValues } from "../types/recipe/recipe-meta-values";
import { buildRecipeUpdateRequest } from "../utils/buildRecipeUpdateRequest";
import { recipeMetaProblems } from "../utils/recipeMetaProblems";
import { recipeMetaValues } from "../utils/recipeMetaValues";

function meta(patch: Partial<RecipeMetaValues> = {}): RecipeMetaValues {
  return { title: "Soup", description: "", source: "", ...patch };
}

describe("recipeMetaProblems", () => {
  it("has none for a titled recipe with blank optional fields", () => {
    expect(recipeMetaProblems(meta())).toEqual({});
  });

  it("needs a title that isn't only spaces, unless only lengths are checked", () => {
    expect(recipeMetaProblems(meta({ title: "   " }))).toEqual({ title: PROBLEMS.titleRequired });
    expect(recipeMetaProblems(meta({ title: "" }), { lengthsOnly: true })).toEqual({});
  });

  it("counts each field trimmed, against the backend's limits", () => {
    const fits = meta({
      title: ` ${"t".repeat(RECIPE_TITLE_MAX_LENGTH)} `,
      description: "d".repeat(RECIPE_DESCRIPTION_MAX_LENGTH),
      source: "s".repeat(RECIPE_SOURCE_MAX_LENGTH),
    });
    expect(recipeMetaProblems(fits)).toEqual({});

    const over = meta({
      title: "t".repeat(RECIPE_TITLE_MAX_LENGTH + 1),
      description: "d".repeat(RECIPE_DESCRIPTION_MAX_LENGTH + 1),
      source: "s".repeat(RECIPE_SOURCE_MAX_LENGTH + 1),
    });
    expect(recipeMetaProblems(over, { lengthsOnly: true })).toEqual({
      title: tooLongProblem(over.title, RECIPE_TITLE_MAX_LENGTH),
      description: tooLongProblem(over.description, RECIPE_DESCRIPTION_MAX_LENGTH),
      source: tooLongProblem(over.source, RECIPE_SOURCE_MAX_LENGTH),
    });
  });

  it("counts an emoji as one character, as the backend does", () => {
    expect(recipeMetaProblems(meta({ title: "🍅".repeat(RECIPE_TITLE_MAX_LENGTH) }))).toEqual({});
  });
});

describe("buildRecipeUpdateRequest", () => {
  it("trims, and sends a blank description or source as null", () => {
    expect(buildRecipeUpdateRequest(meta({ title: "  Soup ", description: "  ", source: " Gran " }))).toEqual({
      title: "Soup",
      description: null,
      source: "Gran",
    });
  });
});

describe("recipeMetaValues", () => {
  it("starts from what's saved, with a missing description or source as blank", () => {
    expect(recipeMetaValues({ title: "Soup", description: null, source: "Gran" })).toEqual({
      title: "Soup",
      description: "",
      source: "Gran",
    });
  });
});
