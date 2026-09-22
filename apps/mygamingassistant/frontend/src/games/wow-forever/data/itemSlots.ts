/**
 * Equip slots and item qualities.
 *
 * `ITEM_SLOTS` / `ITEM_QUALITIES` MUST match `ItemSlot` / `ItemQuality` in
 * `backend/app/schemas/wow/extracted_item.py` — the item reader returns these
 * values. `backend/tests/test_wow_stat_keys_parity.py` checks both.
 */
export const ITEM_SLOTS = [
  "head",
  "neck",
  "shoulder",
  "back",
  "chest",
  "shirt",
  "tabard",
  "wrist",
  "hands",
  "waist",
  "legs",
  "feet",
  "finger",
  "trinket",
  "one_hand",
  "main_hand",
  "off_hand",
  "held_in_off_hand",
  "two_hand",
  "ranged",
  "thrown",
  "relic",
  "other",
] as const;

export type ItemSlot = (typeof ITEM_SLOTS)[number];

export const ITEM_QUALITIES = [
  "poor",
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "artifact",
  "heirloom",
] as const;

export type ItemQuality = (typeof ITEM_QUALITIES)[number];

export const SLOT_LABELS: Record<ItemSlot, string> = {
  head: "Head",
  neck: "Neck",
  shoulder: "Shoulder",
  back: "Back",
  chest: "Chest",
  shirt: "Shirt",
  tabard: "Tabard",
  wrist: "Wrist",
  hands: "Hands",
  waist: "Waist",
  legs: "Legs",
  feet: "Feet",
  finger: "Finger",
  trinket: "Trinket",
  one_hand: "One-Hand",
  main_hand: "Main Hand",
  off_hand: "Off Hand",
  held_in_off_hand: "Held In Off-hand",
  two_hand: "Two-Hand",
  ranged: "Ranged",
  thrown: "Thrown",
  relic: "Relic",
  other: "Other",
};

/** Slots whose weapon DPS is ranged DPS. */
const RANGED_WEAPON_SLOTS: ReadonlySet<ItemSlot> = new Set(["ranged", "thrown"]);

export function isRangedWeaponSlot(slot: ItemSlot | null): boolean {
  return slot !== null && RANGED_WEAPON_SLOTS.has(slot);
}

/** Slots that carry weapon damage lines. */
const WEAPON_SLOTS: ReadonlySet<ItemSlot> = new Set([
  "one_hand",
  "main_hand",
  "off_hand",
  "two_hand",
  "ranged",
  "thrown",
]);

export function isWeaponSlot(slot: ItemSlot | null): boolean {
  return slot !== null && WEAPON_SLOTS.has(slot);
}

export function isItemSlot(value: string): value is ItemSlot {
  return (ITEM_SLOTS as readonly string[]).includes(value);
}

export function isItemQuality(value: string): value is ItemQuality {
  return (ITEM_QUALITIES as readonly string[]).includes(value);
}
