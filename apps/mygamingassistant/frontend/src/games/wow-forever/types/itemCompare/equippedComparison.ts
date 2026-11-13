import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { ItemDelta } from "@/games/wow-forever/types/itemCompare/itemDelta";

/** One equipped item the hovered item is compared with. */
export type EquippedComparison =
  | { kind: "known"; equipped: CharacterItem; replacesTwoHander: boolean; delta: ItemDelta }
  /** `reason` says whose stats the game files can't give: the equipped item's or the hovered item's. */
  | { kind: "unknown"; equipped: CharacterItem; replacesTwoHander: boolean; reason: "equipped" | "candidate" };
