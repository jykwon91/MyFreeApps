import type { CharacterRecipe } from "@/games/wow-forever/types/character/characterRecipe";

/** One profession the character has learned. `id` is the client's SkillLine id (197 Tailoring, 185 Cooking…). */
export interface CharacterProfession {
  id: number;
  name: string;
  skill: number;
  /** The current rank's cap (75 / 150 / 225 / 300). */
  max_skill: number;
  recipes: CharacterRecipe[];
}
