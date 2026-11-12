import type { PaperDollSlot } from "@/games/wow-forever/types/character/paperDollSlot";

/** Names this browser looked up, most recent first. Names only — never the answers. */
export const RECENT_CHARACTERS_STORAGE_KEY = "mga.wowForever.character.v1";
export const RECENT_CHARACTERS_MAX = 5;

/** The character page: /wow-forever/character/:slug. */
export const CHARACTER_PAGE_PATH = "/wow-forever/character";

/** The character page's API, relative to the app origin (the render is a plain <img>). */
export const CHARACTER_API_BASE = "/api/wow/characters";

/** Blizzard's faction key as the game names it. */
export const FACTION_LABELS: Readonly<Record<string, string>> = { alliance: "Alliance", horde: "Horde" };

/** The game's character pane: left column, right column, then the weapons along the bottom. */
export const PAPER_DOLL_LEFT: readonly PaperDollSlot[] = [
  { slot: "HEAD", label: "Head" },
  { slot: "NECK", label: "Neck" },
  { slot: "SHOULDER", label: "Shoulder" },
  { slot: "BACK", label: "Back" },
  { slot: "CHEST", label: "Chest" },
  { slot: "SHIRT", label: "Shirt" },
  { slot: "TABARD", label: "Tabard" },
  { slot: "WRIST", label: "Wrist" },
];

export const PAPER_DOLL_RIGHT: readonly PaperDollSlot[] = [
  { slot: "HANDS", label: "Hands" },
  { slot: "WAIST", label: "Waist" },
  { slot: "LEGS", label: "Legs" },
  { slot: "FEET", label: "Feet" },
  { slot: "FINGER_1", label: "Ring" },
  { slot: "FINGER_2", label: "Ring" },
  { slot: "TRINKET_1", label: "Trinket" },
  { slot: "TRINKET_2", label: "Trinket" },
];

export const PAPER_DOLL_WEAPONS: readonly PaperDollSlot[] = [
  { slot: "MAIN_HAND", label: "Main hand" },
  { slot: "OFF_HAND", label: "Off hand" },
  { slot: "RANGED", label: "Ranged" },
  { slot: "AMMO", label: "Ammo" },
];

/** Shown only when something is in it: an empty ammo pouch isn't a gap in a caster's gear. */
export const OPTIONAL_SLOTS: ReadonlySet<string> = new Set(["AMMO"]);

/** A main hand of this type fills the off hand too. */
export const TWO_HAND_INVENTORY_TYPE = "TWOHWEAPON";
export const OFF_HAND_SLOT = "OFF_HAND";
export const MAIN_HAND_SLOT = "MAIN_HAND";

/** Green for what gear adds — the game's equip-bonus colour, readable in both themes. */
export const CHARACTER_BONUS_TEXT = "text-green-700 dark:text-green-400";
