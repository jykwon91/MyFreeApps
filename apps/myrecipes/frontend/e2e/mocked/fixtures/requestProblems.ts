/**
 * Why the backend would answer 422 to a request body, mirroring the pydantic
 * request schemas in apps/myrecipes/backend/app/schemas/recipe (RecipeUpdateRequest,
 * CookLogCreateRequest, VersionCreateRequest with IngredientInput and StepInput),
 * all extra="forbid". Each returns null when the body is accepted.
 */
const UPDATE_FIELDS = ["title", "description", "source"];
const COOK_FIELDS = ["cooked_at", "rating", "outcome_notes"];
const VERSION_FIELDS = ["base_version_id", "change_note", "servings", "prep_minutes", "cook_minutes", "ingredients", "steps"];
const INGREDIENT_FIELDS = ["name", "quantity", "unit", "note", "lineage_key"];
const STEP_FIELDS = ["instruction"];
const TITLE_MAX = 255;
const DESCRIPTION_MAX = 5000;
const SOURCE_MAX = 1000;
const RATING_MIN = 1;
const RATING_MAX = 5;
const OUTCOME_NOTES_MAX = 2000;
const CHANGE_NOTE_MAX = 2000;
const SERVINGS_MAX = 50;
const MINUTES_MAX = 2_147_483_647;
const INGREDIENT_NAME_MAX = 255;
const INGREDIENT_UNIT_MAX = 50;
const INGREDIENT_NOTE_MAX = 255;
const INGREDIENT_QUANTITY_MAX = 9_999_999.999;
const STEP_INSTRUCTION_MAX = 5000;

type Fields = Record<string, unknown>;

function tooLong(value: unknown, max: number): boolean {
  return typeof value === "string" && value.length > max;
}

function extraField(body: Fields, allowed: string[]): string | null {
  const extra = Object.keys(body).find((key) => !allowed.includes(key));
  return extra ? `extra field not permitted: ${extra}` : null;
}

function outOfRange(value: unknown, min: number, max: number): boolean {
  return value !== undefined && value !== null && (typeof value !== "number" || value < min || value > max);
}

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function updateProblem(body: Fields): string | null {
  const extra = extraField(body, UPDATE_FIELDS);
  if (extra) return extra;
  if (typeof body.title === "string" && body.title.length === 0) return "title must not be empty";
  if (tooLong(body.title, TITLE_MAX) || tooLong(body.description, DESCRIPTION_MAX) || tooLong(body.source, SOURCE_MAX)) {
    return "value too long";
  }
  return null;
}

export function cookProblem(body: Fields): string | null {
  const extra = extraField(body, COOK_FIELDS);
  if (extra) return extra;
  const { rating } = body;
  if (rating !== undefined && rating !== null && (!Number.isInteger(rating) || outOfRange(rating, RATING_MIN, RATING_MAX))) {
    return `rating must be ${RATING_MIN} to ${RATING_MAX}`;
  }
  if (tooLong(body.outcome_notes, OUTCOME_NOTES_MAX)) return "outcome_notes too long";
  return null;
}

function ingredientProblem(ingredient: unknown): string | null {
  if (!isFields(ingredient)) return "ingredient must be an object";
  const extra = extraField(ingredient, INGREDIENT_FIELDS);
  if (extra) return extra;
  if (typeof ingredient.name !== "string" || ingredient.name.length === 0) return "ingredient name must not be empty";
  if (tooLong(ingredient.name, INGREDIENT_NAME_MAX) || tooLong(ingredient.unit, INGREDIENT_UNIT_MAX) || tooLong(ingredient.note, INGREDIENT_NOTE_MAX)) {
    return "ingredient value too long";
  }
  if (outOfRange(ingredient.quantity, 0, INGREDIENT_QUANTITY_MAX)) return "ingredient quantity out of range";
  return null;
}

function stepProblem(step: unknown): string | null {
  if (!isFields(step)) return "step must be an object";
  const extra = extraField(step, STEP_FIELDS);
  if (extra) return extra;
  if (typeof step.instruction !== "string" || step.instruction.length === 0) return "step instruction must not be empty";
  return tooLong(step.instruction, STEP_INSTRUCTION_MAX) ? "step instruction too long" : null;
}

export function versionProblem(body: Fields): string | null {
  const extra = extraField(body, VERSION_FIELDS);
  if (extra) return extra;
  if (tooLong(body.change_note, CHANGE_NOTE_MAX) || tooLong(body.servings, SERVINGS_MAX)) return "value too long";
  if (outOfRange(body.prep_minutes, 0, MINUTES_MAX) || outOfRange(body.cook_minutes, 0, MINUTES_MAX)) return "minutes out of range";
  const { ingredients = [], steps = [] } = body;
  if (!Array.isArray(ingredients) || !Array.isArray(steps)) return "ingredients and steps must be lists";
  return ingredients.map(ingredientProblem).find(Boolean) ?? steps.map(stepProblem).find(Boolean) ?? null;
}
