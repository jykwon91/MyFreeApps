import { WOW_ICONS } from "@/games/wow-forever/data/icons/wowIconData";
import { WOW_ICON_BASE } from "@/games/wow-forever/data/icons/wowIconConfig";
import { ITEM_QUALITIES, type ItemQuality } from "@/games/wow-forever/data/itemSlots";
import type { WowIconFile } from "@/games/wow-forever/types/icons/wowIconFile";
import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

/** The client's quality id (0 = poor) as our quality name; unknown ids get no colour. */
function qualityOf(id: number | undefined): ItemQuality | null {
  if (id === undefined) return null;
  return ITEM_QUALITIES[id] ?? null;
}

/** An item's icon and quality, or null when the map has none (the placeholder shows). */
export function itemIcon(itemId: number, icons: WowIconFile = WOW_ICONS): WowIcon | null {
  const entry = icons.items[String(itemId)];
  if (!entry) return null;
  const [fileDataId, quality] = entry;
  return { fileDataId, quality: qualityOf(quality) };
}

/** A spell's icon (no quality), or null. */
export function spellIcon(spellId: number, icons: WowIconFile = WOW_ICONS): WowIcon | null {
  const fileDataId = icons.spells[String(spellId)];
  if (fileDataId === undefined) return null;
  return { fileDataId, quality: null };
}

/** What a recipe row shows: the item it makes, else (an enchant) its spell. */
export function recipeIcon(recipe: Pick<CraftRecipe, "spell" | "creates">, icons: WowIconFile = WOW_ICONS): WowIcon | null {
  if (recipe.creates) return itemIcon(recipe.creates.id, icons);
  return spellIcon(recipe.spell, icons);
}

/** `/api/wow/icons/1.60.1.70790/134829.webp`. */
export function iconUrl(fileDataId: number, build: string = WOW_ICONS.build): string {
  return `${WOW_ICON_BASE}/${build}/${fileDataId}.webp`;
}
