import type { BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";

/** Best gear cards that fill two list rows: the top two picks go in. */
export const PAIRED_BIS_CARDS: Readonly<Record<string, readonly [BisSlotId, BisSlotId]>> = {
  finger: ["finger1", "finger2"],
  trinket: ["trinket1", "trinket2"],
};

/** Weapon cards, filled together: the best two-hander, or main hand + off hand. */
export const WEAPON_BIS_CARDS: ReadonlySet<string> = new Set(["two_hand", "main_hand", "off_hand"]);
