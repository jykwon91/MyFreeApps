/**
 * When leaving a recipe form would lose something, so the website and the phone ask first.
 */
import { describe, expect, it } from "vitest";
import { DRAFT_CAN_BE_REBUILT } from "../constants/recipeDiscard";
import type { RecipeFormValues } from "../types/recipe/recipe-form-values";
import { emptyIngredientRow, emptyStepRow } from "../utils/emptyRecipeRows";
import { newRecipeFormIsDirty } from "../utils/newRecipeFormIsDirty";
import { recipeFormHasText } from "../utils/recipeFormHasText";
import { sameRecipeFormValues } from "../utils/sameRecipeFormValues";
import { tweakFormIsDirty } from "../utils/tweakFormIsDirty";

function blank(): RecipeFormValues {
  return {
    title: "",
    description: "",
    source: "",
    servings: "",
    prepMinutes: "",
    cookMinutes: "",
    ingredients: [emptyIngredientRow("i1")],
    steps: [emptyStepRow("s1")],
  };
}

function filled(): RecipeFormValues {
  return {
    ...blank(),
    title: "Soup",
    ingredients: [
      { key: "i1", name: "salt", quantity: "1", unit: "tsp", note: "", lineageKey: "lk-salt" },
      { key: "i2", name: "water", quantity: "", unit: "", note: "", lineageKey: null },
    ],
    steps: [{ key: "s1", instruction: "Boil." }],
  };
}

describe("recipeFormHasText", () => {
  it("is false for a blank form, or one with only spaces", () => {
    expect(recipeFormHasText(blank())).toBe(false);
    expect(recipeFormHasText({ ...blank(), title: "   " })).toBe(false);
  });

  it.each([
    ["a field", { ...blank(), servings: "4" }],
    ["an ingredient", { ...blank(), ingredients: [{ ...emptyIngredientRow("i1"), note: "fresh" }] }],
    ["a step", { ...blank(), steps: [{ key: "s1", instruction: "Stir." }] }],
  ])("is true once %s has text", (_, values) => {
    expect(recipeFormHasText(values)).toBe(true);
  });
});

describe("sameRecipeFormValues", () => {
  it("is true for equal forms that aren't the same object", () => {
    expect(sameRecipeFormValues(filled(), filled())).toBe(true);
  });

  it.each([
    ["a field changed", { ...filled(), cookMinutes: "5" }],
    ["an ingredient changed", { ...filled(), ingredients: [{ ...filled().ingredients[0], quantity: "2" }, filled().ingredients[1]] }],
    ["rows reordered", { ...filled(), ingredients: [...filled().ingredients].reverse() }],
    ["a blank row added", { ...filled(), steps: [...filled().steps, emptyStepRow("s2")] }],
    ["a row removed", { ...filled(), ingredients: filled().ingredients.slice(0, 1) }],
  ])("is false with %s", (_, changed) => {
    expect(sameRecipeFormValues(changed, filled())).toBe(false);
  });
});

describe("newRecipeFormIsDirty", () => {
  it("asks for a blank form only once something is typed", () => {
    expect(newRecipeFormIsDirty(blank(), blank())).toBe(false);
    expect(newRecipeFormIsDirty({ ...blank(), title: "S" }, blank())).toBe(true);
  });

  it("asks for a discovered draft only once it's edited, since its page can be read again", () => {
    expect(DRAFT_CAN_BE_REBUILT.discover).toBe(true);
    expect(newRecipeFormIsDirty(filled(), filled(), "discover")).toBe(false);
    expect(newRecipeFormIsDirty({ ...filled(), title: "Soups" }, filled(), "discover")).toBe(true);
  });

  it("always asks for a photo's draft, which would need reading again", () => {
    expect(newRecipeFormIsDirty(filled(), filled(), "photo")).toBe(true);
  });

  it("an edit undone is no longer a change", () => {
    expect(newRecipeFormIsDirty({ ...filled(), title: "Soup" }, filled(), "discover")).toBe(false);
  });
});

describe("tweakFormIsDirty", () => {
  it("is false until the version or the change note changes", () => {
    expect(tweakFormIsDirty(filled(), filled(), "")).toBe(false);
    expect(tweakFormIsDirty(filled(), filled(), "More salt")).toBe(true);
    expect(tweakFormIsDirty({ ...filled(), servings: "6" }, filled(), "")).toBe(true);
  });
});
