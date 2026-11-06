import type { GearItemFacts } from "@/games/wow-forever/types/gearItemFacts";
import type { GearSource } from "@/games/wow-forever/types/gearSource";

/** The decoded `data/gear/*.json`: every known source and requirement, by item id. */
export interface GearData {
  sources: ReadonlyMap<number, readonly GearSource[]>;
  facts: ReadonlyMap<number, GearItemFacts>;
  /**
   * Items the page never lists: only a raid or world boss gives them (Classic
   * data — raids aren't open yet), the client flags them deprecated, or they're
   * Season of Discovery ids the Classic Era client also has.
   */
  unobtainable: ReadonlySet<number>;
  clientBuild: string;
}
