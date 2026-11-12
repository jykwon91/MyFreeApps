import { describe, expect, it } from "vitest";
import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import {
  RECIPE_FORM_PROBLEMS as PROBLEMS,
  RECIPE_DESCRIPTION_MAX_LENGTH,
  RECIPE_TITLE_MAX_LENGTH,
  STEP_INSTRUCTION_MAX_LENGTH,
} from "../constants/recipeForm";
import type { EditableIngredientRow } from "../types/recipe/editable-ingredient-row";
import type { RecipeFormValues } from "../types/recipe/recipe-form-values";
import { buildRecipeCreateRequest } from "../utils/buildRecipeCreateRequest";
import { emptyIngredientRow, emptyStepRow } from "../utils/emptyRecipeRows";
import { firstRecipeFormProblem } from "../utils/firstRecipeFormProblem";
import { moveRow } from "../utils/moveRow";
import { formatRecipeNumber } from "../utils/formatRecipeNumber";
import { localeDecimalSeparator } from "../utils/localeDecimalSeparator";
import { parseRecipeNumber } from "../utils/parseRecipeNumber";
import { recipeFormProblems } from "../utils/recipeFormProblems";

const EN = ".";
const DE = ",";

function ingredient(key: string, patch: Partial<EditableIngredientRow> = {}): EditableIngredientRow {
  return { ...emptyIngredientRow(key), ...patch };
}

function form(patch: Partial<RecipeFormValues> = {}): RecipeFormValues {
  return {
    title: "Soup",
    description: "",
    source: "",
    servings: "",
    prepMinutes: "",
    cookMinutes: "",
    ingredients: [ingredient("a", { name: "salt" })],
    steps: [{ ...emptyStepRow("s"), instruction: "Stir." }],
    ...patch,
  };
}

describe("buildRecipeCreateRequest", () => {
  it("trims, sends blanks as null, rounds minutes and leaves out empty rows", () => {
    const request = buildRecipeCreateRequest(
      form({
        title: "  Tomato soup ",
        description: " ",
        source: " Grandma ",
        servings: " 4 ",
        prepMinutes: "10.4",
        cookMinutes: "",
        ingredients: [
          ingredient("a", { name: " tomatoes ", quantity: " 2 ", unit: " cans ", note: " crushed " }),
          ingredient("b"),
          ingredient("c", { name: "basil" }),
        ],
        steps: [emptyStepRow("x"), { key: "y", instruction: "  Simmer. " }],
      }),
      EN,
    );
    expect(request).toEqual({
      title: "Tomato soup",
      description: null,
      source: "Grandma",
      servings: "4",
      prep_minutes: 10,
      cook_minutes: null,
      ingredients: [
        { name: "tomatoes", quantity: 2, unit: "cans", note: "crushed", lineage_key: null },
        { name: "basil", quantity: null, unit: null, note: null, lineage_key: null },
      ],
      steps: [{ instruction: "Simmer." }],
    });
  });
});

describe("recipeFormProblems", () => {
  it("has none for a recipe that can be saved", () => {
    const problems = recipeFormProblems(form({ prepMinutes: "0", ingredients: [ingredient("a", { name: "egg", quantity: "0.5" })] }), EN);
    expect(problems).toEqual({ rows: {}, stepRows: {} });
    expect(firstRecipeFormProblem(problems)).toBeUndefined();
  });

  it("asks for a title, an ingredient and a step, top of the form first", () => {
    const problems = recipeFormProblems(form({ title: " ", ingredients: [ingredient("a")], steps: [emptyStepRow("s")] }), EN);
    expect(problems).toEqual({
      rows: {},
      stepRows: {},
      title: PROBLEMS.titleRequired,
      ingredients: PROBLEMS.ingredientsRequired,
      steps: PROBLEMS.stepsRequired,
    });
    expect(firstRecipeFormProblem(problems)).toBe(PROBLEMS.titleRequired);
  });

  it("won't quietly drop an amount that isn't a number, or one with no ingredient named", () => {
    const problems = recipeFormProblems(
      form({
        ingredients: [
          ingredient("a", { name: "flour", quantity: "1/2" }),
          ingredient("b", { quantity: "-1" }),
          ingredient("c", { unit: "cups" }),
        ],
      }),
      EN,
    );
    expect(problems.rows).toEqual({
      a: { quantity: PROBLEMS.quantityInvalid(EN) },
      b: { name: PROBLEMS.ingredientNameRequired, quantity: PROBLEMS.quantityInvalid(EN) },
      c: { name: PROBLEMS.ingredientNameRequired },
    });
    expect(firstRecipeFormProblem(problems)).toBe(PROBLEMS.quantityInvalid(EN));
  });

  it("checks prep and cook minutes", () => {
    const problems = recipeFormProblems(form({ prepMinutes: "abc", cookMinutes: "-5" }), EN);
    expect(problems.prepMinutes).toBe(PROBLEMS.minutesInvalid);
    expect(problems.cookMinutes).toBe(PROBLEMS.minutesInvalid);
  });

  it("rounds fractional minutes rather than refusing them", () => {
    const values = form({ prepMinutes: "1.5", cookMinutes: "2.4" });
    expect(recipeFormProblems(values, EN).prepMinutes).toBeUndefined();
    expect(recipeFormProblems(values, EN).cookMinutes).toBeUndefined();
    expect(buildRecipeCreateRequest(values, EN)).toMatchObject({ prep_minutes: 2, cook_minutes: 2 });
  });

  it("refuses numbers bigger than the columns hold, instead of a server error", () => {
    const fits = recipeFormProblems(
      form({ prepMinutes: "2147483647", ingredients: [ingredient("a", { name: "salt", quantity: "9999999.999" })] }),
      EN,
    );
    expect(fits.prepMinutes).toBeUndefined();
    expect(fits.rows).toEqual({});

    const over = recipeFormProblems(
      form({ cookMinutes: "2147483648", ingredients: [ingredient("a", { name: "salt", quantity: "10000000" })] }),
      EN,
    );
    expect(over.cookMinutes).toBe(PROBLEMS.minutesTooLarge);
    expect(over.rows).toEqual({ a: { quantity: PROBLEMS.quantityTooLarge } });
  });
});

describe("parseRecipeNumber", () => {
  it("reads digits with at most one of the locale's decimal mark", () => {
    expect(parseRecipeNumber("0.5", EN)).toBe(0.5);
    expect(parseRecipeNumber("0.500", EN)).toBe(0.5);
    expect(parseRecipeNumber("1250", EN)).toBe(1250);
    expect(parseRecipeNumber(".5", EN)).toBe(0.5);
    expect(parseRecipeNumber("0,5", DE)).toBe(0.5);
    expect(parseRecipeNumber(" 1,25 ", DE)).toBe(1.25);
    expect(parseRecipeNumber("0,500", DE)).toBe(0.5);
    expect(parseRecipeNumber("00,500", DE)).toBe(0.5);
    expect(parseRecipeNumber("1,000", DE)).toBe(1);
    expect(parseRecipeNumber("1,250", DE)).toBe(1.25);
    expect(parseRecipeNumber("  ", EN)).toBeNull();
  });

  it("never reads the other mark as a thousands separator", () => {
    for (const text of ["0,500", "00,500", "1,000", "1,250", "1,5", "1,234,567.5"]) expect(parseRecipeNumber(text, EN)).toBeNaN();
    for (const text of ["0.500", "00.500", "1.000", "1.250", "1.5", "1.234.567,5"]) expect(parseRecipeNumber(text, DE)).toBeNaN();
    for (const text of ["1/2", "½", "-1", ",", ".", "1.2.3", "1,2,3", "abc", "1e3", "0x10", "Infinity"]) {
      expect(parseRecipeNumber(text, EN)).toBeNaN();
      expect(parseRecipeNumber(text, DE)).toBeNaN();
    }
  });

  it("tells someone who typed the other mark what to type instead, in their locale", () => {
    const hint = (quantity: string, separator: "." | ",") =>
      recipeFormProblems(form({ ingredients: [ingredient("a", { name: "salt", quantity })] }), separator).rows.a?.quantity;
    for (const text of ["0,500", "00,500", "1,000", "1,250"]) {
      expect(hint(text, EN)).toBe("Use a dot for decimals, like 1.25, and no thousands separators, like 1250.");
    }
    for (const text of ["0.500", "00.500", "1.000", "1.250"]) {
      expect(hint(text, DE)).toBe("Use a comma for decimals, like 1,25, and no thousands separators, like 1250.");
    }
    expect(hint("1/2", EN)).toBe(PROBLEMS.quantityInvalid(EN));
    expect(recipeFormProblems(form({ prepMinutes: "1,5" }), EN).prepMinutes).toBe(PROBLEMS.decimalSeparatorHint(EN));
  });
});

describe("a comma-decimal locale", () => {
  it("saves what was typed, and names the problem in its own separator", () => {
    const values = form({ prepMinutes: "1,5", ingredients: [ingredient("a", { name: "salt", quantity: "0,5" }), ingredient("b", { name: "flour", quantity: "1250" })] });
    expect(recipeFormProblems(values, DE).rows).toEqual({});
    expect(buildRecipeCreateRequest(values, DE)).toMatchObject({
      prep_minutes: 2,
      ingredients: [expect.objectContaining({ quantity: 0.5 }), expect.objectContaining({ quantity: 1250 })],
    });

    const unreadable = recipeFormProblems(form({ ingredients: [ingredient("a", { name: "salt", quantity: "1/2" })] }), DE);
    expect(unreadable.rows).toEqual({ a: { quantity: "Enter the amount as a number, like 2 or 0,5." } });
  });

  it("shows stored numbers in that separator, so they read back the same", () => {
    expect(formatRecipeNumber(0.5, DE)).toBe("0,5");
    expect(formatRecipeNumber(1234.25, EN)).toBe("1234.25");
    expect(formatRecipeNumber(null, DE)).toBe("");
    expect(parseRecipeNumber(formatRecipeNumber(2.125, DE), DE)).toBe(2.125);
  });

  it("finds a locale's separator with Intl.NumberFormat.format", () => {
    expect(localeDecimalSeparator("en-US")).toBe(".");
    expect(localeDecimalSeparator("de-DE")).toBe(",");
    expect(localeDecimalSeparator("fr-FR")).toBe(",");
  });
});

describe("length limits", () => {
  // An emoji is one code point but two UTF-16 units: the backend counts the first.
  const emoji = "\u{1F345}";

  it("counts what's sent, trimmed and in code points, as the backend does", () => {
    const fits = recipeFormProblems(form({ title: `  ${emoji.repeat(RECIPE_TITLE_MAX_LENGTH)}  ` }), EN);
    expect(fits.title).toBeUndefined();

    const over = recipeFormProblems(
      form({
        title: "a".repeat(RECIPE_TITLE_MAX_LENGTH + 1),
        description: "d".repeat(RECIPE_DESCRIPTION_MAX_LENGTH + 1),
        ingredients: [ingredient("a", { name: "salt", note: "n".repeat(256) })],
        steps: [{ key: "s", instruction: "x".repeat(STEP_INSTRUCTION_MAX_LENGTH + 1) }],
      }),
      EN,
    );
    expect(over.title).toBe(tooLongProblem("a".repeat(256), RECIPE_TITLE_MAX_LENGTH));
    expect(over.description).toBeDefined();
    expect(over.rows.a).toEqual({ note: tooLongProblem("n".repeat(256), 255) });
    expect(over.stepRows.s).toBeDefined();
    expect(firstRecipeFormProblem(over)).toBe(over.title);
  });

  it("while typing, says only what's too long, not what's still missing", () => {
    const typing = recipeFormProblems(
      form({ title: "", description: "d".repeat(RECIPE_DESCRIPTION_MAX_LENGTH + 1), ingredients: [ingredient("a", { quantity: "x" })], steps: [] }), EN,
      { lengthsOnly: true },
    );
    expect(typing).toEqual({ rows: {}, stepRows: {}, description: tooLongProblem("x".repeat(5001), RECIPE_DESCRIPTION_MAX_LENGTH) });
  });
});

describe("moveRow", () => {
  const rows = [{ key: "a" }, { key: "b" }, { key: "c" }];

  it("swaps a row with its neighbour and stays put at either end", () => {
    expect(moveRow(rows, "b", -1).map((row) => row.key)).toEqual(["b", "a", "c"]);
    expect(moveRow(rows, "b", 1).map((row) => row.key)).toEqual(["a", "c", "b"]);
    expect(moveRow(rows, "a", -1)).toBe(rows);
    expect(moveRow(rows, "c", 1)).toBe(rows);
    expect(moveRow(rows, "missing", 1)).toBe(rows);
  });
});
