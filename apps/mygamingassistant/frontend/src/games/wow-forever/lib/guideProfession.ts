import { PROFESSION } from "@/games/wow-forever/data/professions/professionTypes";
import { GATHERING_GROUP, PROFESSION_GROUPS, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { CRAFTING_PROFESSION, type CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { GatheringProfession } from "@/games/wow-forever/types/gathering/gatheringProfession";

const CRAFTING_VIEWS: readonly string[] = Object.values(CRAFTING_PROFESSION);

/** A profession with a crafting guide (route, shopping list) — First Aid included, though it's a secondary one. */
export function isCraftingProfession(profession: string | null): profession is CraftingProfession {
  return profession !== null && CRAFTING_VIEWS.includes(profession);
}

export function isGatheringProfession(profession: string | null): profession is GatheringProfession {
  return GATHERING_GROUP.options.some((o) => o.id === profession);
}

/** A `?p=` value: any listed profession; anything else opens Cooking. */
export function parseGuideProfession(raw: string | null): GuideProfession {
  return PROFESSION_GROUPS.flatMap((g) => g.options).find((o) => o.id === raw)?.id ?? PROFESSION.cooking;
}
