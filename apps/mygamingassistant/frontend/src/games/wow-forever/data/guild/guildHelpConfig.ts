import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import type { EnchantSlot } from "@/games/wow-forever/crafting/cheapestRoute";
import type { EnchantSlotTarget } from "@/games/wow-forever/types/guild/enchantSlotTarget";

/**
 * Score must be this many percent better than worn to count as an upgrade.
 * Matches the item-compare page's SAME_SCORE_PCT (2).
 */
export const GUILD_HELP_PROBLEM = "Couldn't load the guild's gear and recipes.";

export const UPGRADE_THRESHOLD_PCT = 2;

/** Blizzard's SkillLine id for Enchanting (the crafter must have this profession). */
export const ENCHANTING_SKILL_LINE_ID: number = PROFESSION_SKILL_LINES.enchanting;

/**
 * Maps the game's enchant slot name (from "Enchant <Slot> - …") to the
 * Blizzard CharacterItem.slot values it applies to, plus optional
 * inventory_type constraints (shields vs off-hands, 1H vs 2H weapons).
 */
export const ENCHANT_SLOT_TARGETS: Readonly<Record<EnchantSlot, EnchantSlotTarget>> = {
  "Bracer":    { blizzardSlots: ["WRIST"],                 inventoryTypeIs: null,         inventoryTypesNot: [] },
  "Cloak":     { blizzardSlots: ["BACK"],                  inventoryTypeIs: null,         inventoryTypesNot: [] },
  "Chest":     { blizzardSlots: ["CHEST"],                 inventoryTypeIs: null,         inventoryTypesNot: [] },
  "Boots":     { blizzardSlots: ["FEET"],                  inventoryTypeIs: null,         inventoryTypesNot: [] },
  "Gloves":    { blizzardSlots: ["HANDS"],                 inventoryTypeIs: null,         inventoryTypesNot: [] },
  "Shield":    { blizzardSlots: ["OFF_HAND"],              inventoryTypeIs: "SHIELD",     inventoryTypesNot: [] },
  // "Enchant Weapon" is one-handed only: not two-handers, shields or held-in-off-hand items.
  "Weapon":    { blizzardSlots: ["MAIN_HAND", "OFF_HAND"], inventoryTypeIs: null,         inventoryTypesNot: ["SHIELD", "TWOHWEAPON", "HOLDABLE"] },
  "2H Weapon": { blizzardSlots: ["MAIN_HAND"],             inventoryTypeIs: "TWOHWEAPON", inventoryTypesNot: [] },
  "Off-Hand":  { blizzardSlots: ["OFF_HAND"],              inventoryTypeIs: null,         inventoryTypesNot: ["SHIELD", "HOLDABLE"] },
  "Necklace":  { blizzardSlots: ["NECK"],                  inventoryTypeIs: null,         inventoryTypesNot: [] },
};
