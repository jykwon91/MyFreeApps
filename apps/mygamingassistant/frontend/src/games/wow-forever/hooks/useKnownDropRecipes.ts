import { useEffect, useMemo } from "react";
import { skipToken } from "@reduxjs/toolkit/query/react";
import { useGetCharacterQuery } from "@/games/wow-forever/api/wowCharacterApi";
import { characterNameFromSlug } from "@/games/wow-forever/lib/character/characterSlug";
import { isNotFoundError } from "@/games/wow-forever/lib/isNotFoundError";
import { myProfession } from "@/games/wow-forever/lib/trainers/myProfession";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { KnownRecipesState } from "@/games/wow-forever/types/dropRecipes/knownRecipesState";

/**
 * The recipes `slug`'s character knows in `profession`, from Blizzard. `onFound` runs once Blizzard
 * knows the name, so a typo never becomes a "looked up before" chip.
 */
export function useKnownDropRecipes(slug: string | null, profession: CraftingProfession, onFound: (slug: string) => void): KnownRecipesState {
  // currentData is only ever this slug's answer, so a previous character's recipes never show while the next one loads.
  const { currentData: shown, error, isFetching, refetch } = useGetCharacterQuery(slug ?? skipToken);
  const foundSlug = shown ? slug : null;
  useEffect(() => {
    if (foundSlug) onFound(foundSlug);
  }, [foundSlug, onFound]);
  return useMemo((): KnownRecipesState => {
    if (!slug) return { kind: "none" };
    const characterName = characterNameFromSlug(slug);
    if (shown) {
      const mine = myProfession(shown, profession);
      if (!mine) return { kind: "not-learned", characterName: [shown.name, shown.surname].filter(Boolean).join(" ") };
      return { kind: "ready", mine };
    }
    if (error) {
      if (isNotFoundError(error)) return { kind: "not-found", characterName };
      return { kind: "error", retry: () => void refetch(), retrying: isFetching };
    }
    return { kind: "loading", characterName };
  }, [slug, shown, profession, error, isFetching, refetch]);
}
