import type { MyProfessionState } from "@/games/wow-forever/types/trainers/myProfessionState";
import type { RecipeMarks } from "@/games/wow-forever/types/trainers/recipeMarks";
import type { TrainerRecipeRow } from "@/games/wow-forever/types/trainers/trainerRecipeRow";

/**
 * Each row marked for your character: "known" when they already have it (whatever its skill), else
 * "can-learn" / "needs-skill" by their skill. A specialization recipe they don't know keeps the status it
 * came with (Blizzard doesn't say which specialization they chose), and so does every unknown recipe when
 * the character is the other faction's. Rows are left as they are without a character.
 */
export function markTrainerRecipes(rows: readonly TrainerRecipeRow[], marks: RecipeMarks | null): readonly TrainerRecipeRow[] {
  if (!marks) return rows;
  return rows.map((row) => ({ ...row, status: recipeStatus(row, marks) }));
}

function recipeStatus(row: TrainerRecipeRow, { mine, knownOnly }: RecipeMarks): TrainerRecipeRow["status"] {
  if (mine.knownSpells.has(row.spell)) return "known";
  if (knownOnly || row.spec) return row.status;
  return mine.skill >= row.skill ? "can-learn" : "needs-skill";
}

/** The rows' marks from the page's character state, or null when nothing can be marked. */
export function recipeMarks(state: MyProfessionState): RecipeMarks | null {
  if (state.kind !== "ready") return null;
  return { mine: state.mine, knownOnly: state.otherFaction !== null };
}
