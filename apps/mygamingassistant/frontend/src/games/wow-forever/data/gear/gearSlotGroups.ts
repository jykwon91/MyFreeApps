import type { GearSlotGroup } from "@/games/wow-forever/types/gearSlotGroup";

const WEAPON_NOTE = "Use a two-hander, or a main hand plus an off hand.";

/**
 * The page's slot cards, in character-sheet order. A One-Hand weapon fills
 * either hand; the off-hand card only lists one for a class that can dual
 * wield (`gearFilters.ts`).
 */
export const GEAR_SLOT_GROUPS: readonly GearSlotGroup[] = [
  { id: "head", label: "Head", slots: ["head"], note: null },
  { id: "neck", label: "Neck", slots: ["neck"], note: null },
  { id: "shoulder", label: "Shoulder", slots: ["shoulder"], note: null },
  { id: "back", label: "Back", slots: ["back"], note: null },
  { id: "chest", label: "Chest", slots: ["chest"], note: null },
  { id: "wrist", label: "Wrist", slots: ["wrist"], note: null },
  { id: "hands", label: "Hands", slots: ["hands"], note: null },
  { id: "waist", label: "Waist", slots: ["waist"], note: null },
  { id: "legs", label: "Legs", slots: ["legs"], note: null },
  { id: "feet", label: "Feet", slots: ["feet"], note: null },
  { id: "finger", label: "Rings", slots: ["finger"], note: "You wear two." },
  { id: "trinket", label: "Trinkets", slots: ["trinket"], note: "You wear two." },
  { id: "two_hand", label: "Two-hand weapon", slots: ["two_hand"], note: WEAPON_NOTE },
  { id: "main_hand", label: "Main hand", slots: ["main_hand", "one_hand"], note: WEAPON_NOTE },
  { id: "off_hand", label: "Off hand", slots: ["off_hand", "held_in_off_hand", "one_hand"], note: WEAPON_NOTE },
  { id: "ranged", label: "Ranged", slots: ["ranged", "thrown", "relic"], note: null },
];
