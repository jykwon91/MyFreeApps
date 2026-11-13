import { WOW_ICONS } from "@/games/wow-forever/data/icons/wowIconData";
import { WOW_ICON_BASE } from "@/games/wow-forever/data/icons/wowIconConfig";
import { ITEM_QUALITIES, type ItemQuality } from "@/games/wow-forever/data/itemSlots";
import type { WowIconFile } from "@/games/wow-forever/types/icons/wowIconFile";
import type { WowIcon } from "@/games/wow-forever/types/icons/wowIcon";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";
import type { ClassDetailsFile } from "@/games/wow-forever/types/classes/classDetailsFile";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import classDetailsRaw from "@/games/wow-forever/data/classes/classDetails.json";

// The JSON import types `classes` as a plain record; the generator writes every class.
const CLASS_DETAILS = classDetailsRaw as unknown as ClassDetailsFile;

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

/** An item's quality, or null when the icon map doesn't have the item. */
export function itemQuality(itemId: number, icons: WowIconFile = WOW_ICONS): ItemQuality | null {
  return itemIcon(itemId, icons)?.quality ?? null;
}

/** A spell's icon (no quality), or null. */
export function spellIcon(spellId: number, icons: WowIconFile = WOW_ICONS): WowIcon | null {
  const fileDataId = icons.spells[String(spellId)];
  if (fileDataId === undefined) return null;
  return { fileDataId, quality: null };
}

/** An icon named by its file id (talents and talent trees); 0 = none, so the placeholder shows. */
export function fileIcon(fileDataId: number): WowIcon | null {
  if (fileDataId <= 0) return null;
  return { fileDataId, quality: null };
}

/** What a recipe row shows: the item it makes, else (an enchant) its spell. */
export function recipeIcon(recipe: Pick<CraftRecipe, "spell" | "creates">, icons: WowIconFile = WOW_ICONS): WowIcon | null {
  if (recipe.creates) return itemIcon(recipe.creates.id, icons);
  return spellIcon(recipe.spell, icons);
}

/** A profession's in-game icon (its SkillLine icon), or null. */
export function professionIcon(profession: GuideProfession, icons: WowIconFile = WOW_ICONS): WowIcon | null {
  const fileDataId = icons.skills[String(PROFESSION_SKILL_LINES[profession])];
  if (fileDataId === undefined) return null;
  return { fileDataId, quality: null };
}

/** A class's in-game icon (ChrClasses), or null. */
export function classIcon(classId: WowClassId, details: ClassDetailsFile = CLASS_DETAILS): WowIcon | null {
  return fileIcon(details.classes[classId]?.icon ?? 0);
}

/** `/api/wow/icons/1.60.1.70790/134829.webp`. */
export function iconUrl(fileDataId: number, build: string = WOW_ICONS.build): string {
  return `${WOW_ICON_BASE}/${build}/${fileDataId}.webp`;
}
