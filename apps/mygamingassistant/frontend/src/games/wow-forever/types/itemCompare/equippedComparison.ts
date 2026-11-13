import type { CharacterItem } from "@/games/wow-forever/types/character/characterItem";
import type { ItemDelta } from "@/games/wow-forever/types/itemCompare/itemDelta";
import type { UpgradeVerdict } from "@/games/wow-forever/types/itemCompare/upgradeVerdict";

/** One equipped item the hovered item is compared with. */
export type EquippedComparison =
  /** `verdict` is null when there is no class to score for. */
  | { kind: "known"; equipped: CharacterItem; replacesTwoHander: boolean; delta: ItemDelta; verdict: UpgradeVerdict | null }
  /** `reason` says whose stats the game files can't give: the equipped item's or the hovered item's. */
  | { kind: "unknown"; equipped: CharacterItem; replacesTwoHander: boolean; reason: "equipped" | "candidate" };
