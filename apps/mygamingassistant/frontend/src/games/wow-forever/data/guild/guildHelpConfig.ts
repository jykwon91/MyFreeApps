import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import type { EnchantSlot } from "@/games/wow-forever/crafting/cheapestRoute";

/**
 * Score must be this many percent better than worn to count as an upgrade.
 * Matches the item-compare page's SAME_SCORE_PCT (2).
 */
export const UPGRADE_THRESHOLD_PCT = 2;

/** Blizzard's SkillLine id for Enchanting (the crafter must have this profession). */
export const ENCHANTING_SKILL_LINE_ID: number = PROFESSION_SKILL_LINES.enchanting;

/**
 * Maps the game's enchant slot name (from "Enchant <Slot> - …") to the
 * Blizzard CharacterItem.slot values it applies to, plus an optional
 * inventory_type constraint to filter the right subtype (shields vs off-hands,
 * 2H vs 1H weapons).
 */
export interface EnchantSlotTarget {
  /** CharacterItem.slot values that could match. */
  blizzardSlots: readonly string[];
  /**
   * When set, the item's inventory_type must equal this value for the enchant
   * to apply (e.g. shields only match "SHIELD"; 2H weapons only "TWOHWEAPON").
   * When null, any inventory_type in blizzardSlots matches.
   */
  inventoryTypeIs: string | null;
  /** When true, exclude this inventory_type (off-hand = not a shield). */
  inventoryTypeIsNot: string | null;
}

export const ENCHANT_SLOT_TARGETS: Readonly<Record<EnchantSlot, EnchantSlotTarget>> = {
  "Bracer":    { blizzardSlots: ["WRIST"],                  inventoryTypeIs: null,      inventoryTypeIsNot: null },
  "Cloak":     { blizzardSlots: ["BACK"],                   inventoryTypeIs: null,      inventoryTypeIsNot: null },
  "Chest":     { blizzardSlots: ["CHEST"],                  inventoryTypeIs: null,      inventoryTypeIsNot: null },
  "Boots":     { blizzardSlots: ["FEET"],                   inventoryTypeIs: null,      inventoryTypeIsNot: null },
  "Gloves":    { blizzardSlots: ["HANDS"],                  inventoryTypeIs: null,      inventoryTypeIsNot: null },
  "Shield":    { blizzardSlots: ["OFF_HAND"],               inventoryTypeIs: "SHIELD",  inventoryTypeIsNot: null },
  "Weapon":    { blizzardSlots: ["MAIN_HAND", "OFF_HAND"],  inventoryTypeIs: null,      inventoryTypeIsNot: "SHIELD" },
  "2H Weapon": { blizzardSlots: ["MAIN_HAND"],              inventoryTypeIs: "TWOHWEAPON", inventoryTypeIsNot: null },
  "Off-Hand":  { blizzardSlots: ["OFF_HAND"],               inventoryTypeIs: null,      inventoryTypeIsNot: "SHIELD" },
  "Necklace":  { blizzardSlots: ["NECK"],                   inventoryTypeIs: null,      inventoryTypeIsNot: null },
};
