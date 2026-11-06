import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearItemFacts } from "@/games/wow-forever/types/gearItemFacts";
import type { GearSource } from "@/games/wow-forever/types/gearSource";

/** One item in a slot's list, with what the page shows about it. */
export interface RankedGearItem {
  item: ClientItem;
  score: number;
  /**
   * Score as a percentage of the card's top pick (100 for it). Over 100 when a
   * no-source item scores a little higher but the close rule ranks it lower;
   * for the next upgrade, against the current top pick.
   */
  pctOfBest: number;
  /** Sources the player can use (other-faction / other-class quests removed). */
  sources: readonly GearSource[];
  facts: GearItemFacts;
  /** Level the player can first get and use it at. */
  availableFrom: number;
  /**
   * True when availableFrom was estimated from item level rather than stated
   * in the data (requiredLevel ≤ 1 with no known source). The UI labels
   * these as "probably from about level N".
   */
  availableFromEstimated: boolean;
}
