import type { UpgradeVerdict } from "@/games/wow-forever/types/itemCompare/upgradeVerdict";

/**
 * The inline upgrade comparison for one Auction House result row, computed against the
 * saved character's equipped gear. The character can't use the item, the slot is empty,
 * or the stats aren't known are shown as short labels; a verdict carries the actual result.
 */
export type AuctionUpgrade =
  | {
      kind: "verdict";
      /** Null when the character's class isn't scored (unknown spec). */
      verdict: UpgradeVerdict | null;
      /** The equipped item in the compared slot: its icon. */
      equippedItemId: number;
      /** The equipped item's name, shown below the verdict. */
      equippedName: string;
    }
  | { kind: "slot-empty" }
  | { kind: "cant-use" }
  /** The item or its equipped counterpart has random stats not in the game files. */
  | { kind: "unknown-stats" }
  /** Consumables, materials and other non-gear items have no slot to compare. */
  | { kind: "not-equippable" };
