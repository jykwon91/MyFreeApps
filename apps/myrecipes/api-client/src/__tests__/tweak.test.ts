import { describe, expect, it } from "vitest";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import { CHANGE_NOTE_MAX_LENGTH, RECIPE_FORM_PROBLEMS as PROBLEMS, RECIPE_SERVINGS_MAX_LENGTH } from "../constants/recipeForm";
import { TWEAK_MESSAGES } from "../constants/tweak";
import type { RecipeVersionFormValues } from "../types/recipe/recipe-version-form-values";
import type { VersionResponse } from "../types/recipe/version";
import { buildVersionCreateRequest } from "../utils/buildVersionCreateRequest";
import { changeNoteProblem } from "../utils/changeNoteProblem";
import { emptyIngredientRow, emptyStepRow } from "../utils/emptyRecipeRows";
import { recipeContentProblems } from "../utils/recipeContentProblems";
import { recipeFormProblems } from "../utils/recipeFormProblems";
import { recipeFormValuesFromVersion } from "../utils/recipeFormValuesFromVersion";
import { tweakErrorMessage } from "../utils/tweakErrorMessage";
import { tweakFormProblem } from "../utils/tweakFormProblem";

const VERSION: VersionResponse = {
  id: "v2",
  recipe_id: "r1",
  version_number: 2,
  parent_version_id: "v1",
  change_note: "Less salt",
  servings: "4",
  prep_minutes: 10,
  cook_minutes: null,
  created_at: "2026-11-11T00:00:00Z",
  ingredients: [
    { id: "i1", lineage_key: "lk-flour", position: 0, name: "flour", quantity: 1.5, unit: "cups", note: null },
    { id: "i2", lineage_key: "lk-salt", position: 1, name: "salt", quantity: null, unit: null, note: "to taste" },
  ],
  steps: [{ id: "s1", position: 0, instruction: "Mix." }],
};

function keys() {
  let count = 0;
  return () => `k${++count}`;
}

function values(patch: Partial<RecipeVersionFormValues> = {}): RecipeVersionFormValues {
  return {
    servings: "",
    prepMinutes: "",
    cookMinutes: "",
    ingredients: [{ ...emptyIngredientRow("a"), name: "salt", lineageKey: "lk-salt" }],
    steps: [{ ...emptyStepRow("s"), instruction: "Stir." }],
    ...patch,
  };
}

describe("recipeFormValuesFromVersion", () => {
  it("fills a tweak in from its version, carrying each ingredient's lineage key", () => {
    expect(recipeFormValuesFromVersion(VERSION, ",", keys())).toEqual({
      servings: "4",
      prepMinutes: "10",
      cookMinutes: "",
      ingredients: [
        { key: "k1", name: "flour", quantity: "1,5", unit: "cups", note: "", lineageKey: "lk-flour" },
        { key: "k2", name: "salt", quantity: "", unit: "", note: "to taste", lineageKey: "lk-salt" },
      ],
      steps: [{ key: "k3", instruction: "Mix." }],
    });
  });

  it("shows a version with no servings as an empty field", () => {
    expect(recipeFormValuesFromVersion({ ...VERSION, servings: null }, ".", keys()).servings).toBe("");
  });
});

describe("buildVersionCreateRequest", () => {
  it("sends the base version, the trimmed note and every row's lineage key", () => {
    const request = buildVersionCreateRequest(
      values({
        servings: " 6 ",
        prepMinutes: "12,6",
        cookMinutes: "",
        ingredients: [
          { ...emptyIngredientRow("a"), name: " salt ", quantity: "0,5", lineageKey: "lk-salt" },
          emptyIngredientRow("b"),
          { ...emptyIngredientRow("c"), name: "pepper" },
        ],
        steps: [emptyStepRow("x"), { key: "y", instruction: " Stir. " }],
      }),
      "  Halved the salt ",
      "v2",
      ",",
    );
    expect(request).toEqual({
      base_version_id: "v2",
      change_note: "Halved the salt",
      servings: "6",
      prep_minutes: 13,
      cook_minutes: null,
      ingredients: [
        { name: "salt", quantity: 0.5, unit: null, note: null, lineage_key: "lk-salt" },
        { name: "pepper", quantity: null, unit: null, note: null, lineage_key: null },
      ],
      steps: [{ instruction: "Stir." }],
    });
  });

  it("round-trips a version's own values unchanged", () => {
    const seeded = recipeFormValuesFromVersion(VERSION, ".", keys());
    expect(buildVersionCreateRequest(seeded, "Same", VERSION.id, ".")).toMatchObject({
      servings: "4",
      prep_minutes: 10,
      cook_minutes: null,
      ingredients: [
        { name: "flour", quantity: 1.5, unit: "cups", note: null, lineage_key: "lk-flour" },
        { name: "salt", quantity: null, unit: null, note: "to taste", lineage_key: "lk-salt" },
      ],
    });
  });
});

describe("changeNoteProblem", () => {
  it("asks for a note, but not while typing, and says straight away when it's too long", () => {
    expect(changeNoteProblem("  ")).toBe(PROBLEMS.changeNoteRequired);
    expect(changeNoteProblem("  ", { lengthsOnly: true })).toBeUndefined();
    expect(changeNoteProblem(" Less salt ")).toBeUndefined();
    const long = "x".repeat(CHANGE_NOTE_MAX_LENGTH + 1);
    const tooLong = tooLongProblem(long, CHANGE_NOTE_MAX_LENGTH);
    expect(tooLong).toBeDefined();
    expect(changeNoteProblem(long, { lengthsOnly: true })).toBe(tooLong);
    expect(changeNoteProblem(long)).toBe(tooLong);
    // Spaces round it aren't sent, so they don't count.
    expect(changeNoteProblem(` ${"x".repeat(CHANGE_NOTE_MAX_LENGTH)} `)).toBeUndefined();
  });
});

describe("tweakFormProblem", () => {
  it("names the content's problems first, then the missing note", () => {
    expect(tweakFormProblem(values({ ingredients: [] }), "", ".")).toBe(PROBLEMS.ingredientsRequired);
    expect(tweakFormProblem(values({ cookMinutes: "soon" }), "Note", ".")).toBe(PROBLEMS.minutesInvalid);
    expect(tweakFormProblem(values(), "", ".")).toBe(PROBLEMS.changeNoteRequired);
    expect(tweakFormProblem(values(), "x".repeat(CHANGE_NOTE_MAX_LENGTH + 1), ".")).toMatch(/Keep this to 2,000/);
    expect(tweakFormProblem(values(), "Less salt", ".")).toBeUndefined();
  });

  it("holds servings to the backend's limit, as creating does", () => {
    const tooMany = "s".repeat(RECIPE_SERVINGS_MAX_LENGTH + 1);
    const tooLong = tooLongProblem(tooMany, RECIPE_SERVINGS_MAX_LENGTH);
    expect(tooLong).toBeDefined();
    expect(tweakFormProblem(values({ servings: tooMany }), "Less salt", ".")).toBe(tooLong);
    // Said while typing, too, and spaces round it aren't sent.
    expect(recipeContentProblems(values({ servings: tooMany }), ".", { lengthsOnly: true }).servings).toBe(tooLong);
    expect(tweakFormProblem(values({ servings: ` ${"s".repeat(RECIPE_SERVINGS_MAX_LENGTH)} ` }), "Less salt", ".")).toBeUndefined();
  });
});

describe("servings in a new recipe", () => {
  it("is reported once, from the shared content check", () => {
    const tooMany = "s".repeat(RECIPE_SERVINGS_MAX_LENGTH + 1);
    const form = { ...values({ servings: tooMany }), title: "Soup", description: "", source: "" };
    expect(recipeFormProblems(form, ".").servings).toBe(tooLongProblem(tooMany, RECIPE_SERVINGS_MAX_LENGTH));
  });
});

describe("tweakErrorMessage", () => {
  it("says why a tweak didn't save, by status", () => {
    expect(tweakErrorMessage({ status: 400 })).toBe(TWEAK_MESSAGES.changedOrNotYours);
    expect(tweakErrorMessage({ status: 404 })).toBe(TWEAK_MESSAGES.changedOrNotYours);
    expect(tweakErrorMessage({ status: 422 })).toBe(TWEAK_MESSAGES.checkEntries);
    expect(tweakErrorMessage({ status: 401 })).toBe(TWEAK_MESSAGES.signInAgain);
    expect(tweakErrorMessage({ status: 500 })).toBe("Couldn't save this tweak — please try again.");
    expect(tweakErrorMessage(new Error("Network Error"))).toBe(TWEAK_MESSAGES.couldntSave);
  });
});
