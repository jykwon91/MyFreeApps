import type { CharacterRecipe } from "@/games/wow-forever/types/character/characterRecipe";
import type { SkillColor } from "@/games/wow-forever/types/gathering/skillColor";

/** Known recipes of one colour at the character's skill; `color` null = recipes we can't colour. */
export interface KnownRecipeGroup {
  color: SkillColor | null;
  recipes: CharacterRecipe[];
}
