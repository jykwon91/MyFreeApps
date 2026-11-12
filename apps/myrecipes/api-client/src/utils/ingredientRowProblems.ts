import { tooLongProblem } from "@platform/core/utils/tooLongProblem";
import {
  INGREDIENT_NAME_MAX_LENGTH,
  INGREDIENT_NOTE_MAX_LENGTH,
  INGREDIENT_QUANTITY_MAX,
  INGREDIENT_UNIT_MAX_LENGTH,
  RECIPE_FORM_PROBLEMS as PROBLEMS,
} from "../constants/recipeForm";
import type { DecimalSeparator } from "../types/recipe/decimal-separator";
import type { EditableIngredientRow } from "../types/recipe/editable-ingredient-row";
import type { IngredientRowProblems } from "../types/recipe/ingredient-row-problems";
import type { RecipeProblemScope } from "../types/recipe/recipe-problem-scope";
import { parseRecipeNumber } from "./parseRecipeNumber";
import { recipeNumberProblem } from "./recipeNumberProblem";

/**
 * One row's problems, counted on what is sent (trimmed). Nothing typed is dropped quietly: an
 * amount that isn't a number of 0 or more (or is more than the column holds), or a row with an
 * amount, unit or note but no name, is a problem.
 */
export function ingredientRowProblems(
  row: EditableIngredientRow,
  decimalSeparator: DecimalSeparator,
  { lengthsOnly = false }: RecipeProblemScope = {},
): IngredientRowProblems {
  const name = row.name.trim();
  const problems: IngredientRowProblems = {};
  const nameTooLong = tooLongProblem(name, INGREDIENT_NAME_MAX_LENGTH);
  const unit = tooLongProblem(row.unit.trim(), INGREDIENT_UNIT_MAX_LENGTH);
  const note = tooLongProblem(row.note.trim(), INGREDIENT_NOTE_MAX_LENGTH);
  const hasOther = [row.quantity, row.unit, row.note].some((text) => text.trim() !== "");

  if (nameTooLong) problems.name = nameTooLong;
  else if (!lengthsOnly && name === "" && hasOther) problems.name = PROBLEMS.ingredientNameRequired;
  const quantity = parseRecipeNumber(row.quantity, decimalSeparator);
  const unreadable = recipeNumberProblem(row.quantity, decimalSeparator, PROBLEMS.quantityInvalid(decimalSeparator));
  if (!lengthsOnly && unreadable) problems.quantity = unreadable;
  else if (!lengthsOnly && quantity !== null && quantity > INGREDIENT_QUANTITY_MAX) problems.quantity = PROBLEMS.quantityTooLarge;
  if (unit) problems.unit = unit;
  if (note) problems.note = note;
  return problems;
}
