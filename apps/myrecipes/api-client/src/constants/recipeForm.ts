import type { DecimalSeparator } from "../types/recipe/decimal-separator";

// The backend's limits (app/schemas/recipe), in code points as Pydantic counts them. Web stops
// typing at them; the phone counts towards them and says when a field is over.
export const RECIPE_TITLE_MAX_LENGTH = 255;
export const RECIPE_DESCRIPTION_MAX_LENGTH = 5000;
export const RECIPE_SOURCE_MAX_LENGTH = 1000;
export const RECIPE_SERVINGS_MAX_LENGTH = 50;
export const INGREDIENT_NAME_MAX_LENGTH = 255;
export const INGREDIENT_UNIT_MAX_LENGTH = 50;
export const INGREDIENT_NOTE_MAX_LENGTH = 255;
export const STEP_INSTRUCTION_MAX_LENGTH = 5000;
export const CHANGE_NOTE_MAX_LENGTH = 2000;
// The largest values the columns hold: quantity is Numeric(10, 3), minutes are Integer.
export const INGREDIENT_QUANTITY_MAX = 9_999_999.999;
export const RECIPE_MINUTES_MAX = 2_147_483_647;

/** Why a recipe form can't be saved yet, worded the same on web and phone. */
export const RECIPE_FORM_PROBLEMS = {
  titleRequired: "Give your recipe a title.",
  ingredientsRequired: "Add at least one ingredient.",
  stepsRequired: "Add at least one step.",
  ingredientNameRequired: "Name this ingredient, or remove it.",
  quantityInvalid: (decimalSeparator: DecimalSeparator) => `Enter the amount as a number, like 2 or 0${decimalSeparator}5.`,
  quantityTooLarge: "Enter an amount below 10 million.",
  minutesInvalid: "Enter the minutes as a number, like 15.",
  decimalSeparatorHint: (decimalSeparator: DecimalSeparator) =>
    decimalSeparator === "."
      ? "Use a dot for decimals, like 1.25, and no thousands separators, like 1250."
      : "Use a comma for decimals, like 1,25, and no thousands separators, like 1250.",
  minutesTooLarge: "Enter fewer minutes than that.",
  changeNoteRequired: "Add a note describing what you changed.",
} as const;
