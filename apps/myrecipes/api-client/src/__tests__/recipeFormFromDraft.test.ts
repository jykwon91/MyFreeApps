import { describe, expect, it } from "vitest";
import type { RecipeExtractionDraft } from "../types/recipe/extraction";
import { draftNeedsReview } from "../utils/draftNeedsReview";
import { recipeFormValuesFromDraft } from "../utils/recipeFormValuesFromDraft";

const DRAFT: RecipeExtractionDraft = {
  title: "Flan",
  description: null,
  source: "Serious Eats (https://example.com/flan)",
  servings: "8",
  prep_minutes: 20,
  cook_minutes: 1.5,
  ingredients: [{ name: "milk", quantity: 0.5, unit: "l", note: null }],
  steps: [{ instruction: "Bake." }],
};

function keys(): () => string {
  let next = 0;
  return () => `k${(next += 1)}`;
}

describe("recipeFormValuesFromDraft", () => {
  it("fills the form in, amounts and minutes in the given decimal separator, rows unlinked", () => {
    expect(recipeFormValuesFromDraft(DRAFT, ",", keys())).toEqual({
      title: "Flan",
      description: "",
      source: "Serious Eats (https://example.com/flan)",
      servings: "8",
      prepMinutes: "20",
      cookMinutes: "1,5",
      ingredients: [{ key: "k1", name: "milk", quantity: "0,5", unit: "l", note: "", lineageKey: null }],
      steps: [{ key: "k2", instruction: "Bake." }],
    });
  });

  it("leaves one empty row to type into when the draft has no ingredients or steps", () => {
    const values = recipeFormValuesFromDraft({ ...DRAFT, ingredients: [], steps: [] }, ".", keys());
    expect(values.ingredients).toEqual([{ key: "k1", name: "", quantity: "", unit: "", note: "", lineageKey: null }]);
    expect(values.steps).toEqual([{ key: "k2", instruction: "" }]);
  });
});

describe("draftNeedsReview", () => {
  it("asks for a check when the title, ingredients or steps are missing", () => {
    expect(draftNeedsReview(DRAFT)).toBe(false);
    expect(draftNeedsReview({ ...DRAFT, title: " " })).toBe(true);
    expect(draftNeedsReview({ ...DRAFT, ingredients: [] })).toBe(true);
    expect(draftNeedsReview({ ...DRAFT, steps: [] })).toBe(true);
  });
});
