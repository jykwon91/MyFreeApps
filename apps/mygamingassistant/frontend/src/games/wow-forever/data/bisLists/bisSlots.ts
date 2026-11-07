/**
 * The rows of a player's BiS list, in character-sheet order. Each fills from
 * one Best gear slot card (`GEAR_SLOT_GROUPS`), so a row accepts what that
 * card would list for the class. Rings and trinkets get two rows each.
 */
export const BIS_SLOTS = [
  { id: "head", label: "Head", groupId: "head" },
  { id: "neck", label: "Neck", groupId: "neck" },
  { id: "shoulder", label: "Shoulder", groupId: "shoulder" },
  { id: "back", label: "Back", groupId: "back" },
  { id: "chest", label: "Chest", groupId: "chest" },
  { id: "wrist", label: "Wrist", groupId: "wrist" },
  { id: "hands", label: "Hands", groupId: "hands" },
  { id: "waist", label: "Waist", groupId: "waist" },
  { id: "legs", label: "Legs", groupId: "legs" },
  { id: "feet", label: "Feet", groupId: "feet" },
  { id: "finger1", label: "Ring 1", groupId: "finger" },
  { id: "finger2", label: "Ring 2", groupId: "finger" },
  { id: "trinket1", label: "Trinket 1", groupId: "trinket" },
  { id: "trinket2", label: "Trinket 2", groupId: "trinket" },
  { id: "two_hand", label: "Two-hand weapon", groupId: "two_hand" },
  { id: "main_hand", label: "Main hand", groupId: "main_hand" },
  { id: "off_hand", label: "Off hand", groupId: "off_hand" },
  { id: "ranged", label: "Ranged", groupId: "ranged" },
] as const;

export type BisSlot = (typeof BIS_SLOTS)[number];
export type BisSlotId = BisSlot["id"];

const SLOT_IDS: ReadonlySet<string> = new Set(BIS_SLOTS.map((s) => s.id));

export function isBisSlotId(value: unknown): value is BisSlotId {
  return typeof value === "string" && SLOT_IDS.has(value);
}

/** A two-hander takes both hands: picking one clears these, and picking either of these clears it. */
export const TWO_HAND_SLOT: BisSlotId = "two_hand";
export const ONE_HAND_SLOTS: readonly BisSlotId[] = ["main_hand", "off_hand"];

export const WEAPON_NOTE = "A two-hander, or a main hand plus an off hand: picking one clears the other.";
