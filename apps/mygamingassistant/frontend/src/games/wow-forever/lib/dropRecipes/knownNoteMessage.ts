import { DROP_RECIPES_TEXT } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import type { KnownRecipesState } from "@/games/wow-forever/types/dropRecipes/knownRecipesState";

/** The line under the character box for `state`; null when no character is picked or Blizzard failed (that shows a retry). */
export function knownNoteMessage(state: KnownRecipesState, profession: string): string | null {
  switch (state.kind) {
    case "none":
    case "error":
      return null;
    case "loading":
      return DROP_RECIPES_TEXT.knownLoading(state.characterName);
    case "not-found":
      return DROP_RECIPES_TEXT.knownNotFound(state.characterName);
    case "not-learned":
      return DROP_RECIPES_TEXT.knownNotLearned(state.characterName, profession);
    case "ready":
      return DROP_RECIPES_TEXT.knownReady(state.mine.characterName, profession, state.mine.skill, state.mine.maxSkill);
  }
}
