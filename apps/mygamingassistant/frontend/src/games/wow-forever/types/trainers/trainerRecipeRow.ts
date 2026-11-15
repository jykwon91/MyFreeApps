/** One recipe that a trainer teaches, enriched from the recipe book if available. */
export interface TrainerRecipeRow {
  spell: number;
  /** Name from the recipe book; null when the spell isn't in the recipe book yet. */
  name: string | null;
  /** Learn skill from trainerNpcSpells (forever-adjusted). */
  skill: number;
  /** Training cost in copper. 0 = no cost data. */
  cost: number;
  /** "can-learn": player skill >= recipe skill; "needs-skill": needs more skill; "needs-data": no player skill provided. */
  status: "can-learn" | "needs-skill" | "needs-data";
}
