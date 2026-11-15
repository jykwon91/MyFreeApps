import { itemIcon, professionIcon, spellIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { PlanCraftRow } from "@/games/wow-forever/types/goalPlanner/planCraftRow";
import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";

/** A crafting row's picture: what it makes, else the recipe's spell, else its profession. */
export function craftRowIcon(row: PlanCraftRow): WowIcon | null {
  if (row.itemId !== null) return itemIcon(row.itemId);
  if (row.spell !== null) return spellIcon(row.spell);
  return professionIcon(row.profession);
}
