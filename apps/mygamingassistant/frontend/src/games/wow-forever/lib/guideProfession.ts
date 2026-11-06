import { PROFESSION } from "@/games/wow-forever/data/professions/professionTypes";
import { SECONDARY_GROUP, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { CRAFTING_PROFESSION, type CraftingProfession } from "@/games/wow-forever/types/crafting";

const CRAFTING_VIEWS: readonly string[] = Object.values(CRAFTING_PROFESSION);

/** A profession with a crafting guide (route, shopping list) — First Aid included, though it's a secondary one. */
export function isCraftingProfession(profession: string | null): profession is CraftingProfession {
  return profession !== null && CRAFTING_VIEWS.includes(profession);
}

/** A `?p=` value: any listed profession; anything else opens Cooking. */
export function parseGuideProfession(raw: string | null): GuideProfession {
  if (isCraftingProfession(raw)) return raw;
  return SECONDARY_GROUP.options.find((o) => o.id === raw)?.id ?? PROFESSION.cooking;
}
