import { PROFESSION } from "@/games/wow-forever/data/professions/professionTypes";
import { CRAFTING_GROUP, SECONDARY_GROUP, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

export function isCraftingProfession(profession: string | null): profession is CraftingProfession {
  return CRAFTING_GROUP.options.some((o) => o.id === profession);
}

/** A `?p=` value: any listed profession; anything else opens Cooking. */
export function parseGuideProfession(raw: string | null): GuideProfession {
  if (isCraftingProfession(raw)) return raw;
  return SECONDARY_GROUP.options.find((o) => o.id === raw)?.id ?? PROFESSION.cooking;
}
