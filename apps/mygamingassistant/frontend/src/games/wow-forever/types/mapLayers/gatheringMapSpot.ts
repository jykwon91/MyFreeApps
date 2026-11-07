import type { GatherSkill } from "@/games/wow-forever/types/recipeSources";

/** A herb or ore node type's sample spot in one zone (the generated `objectSpots` rows), for the Gathering layers. */
export interface GatheringMapSpot {
  id: string;
  skill: GatherSkill;
  /** "Peacebloom". */
  name: string;
  /** How many of this node spawn in the zone. */
  count: number;
  /** Skill needed to gather it (the Forever client's lock). */
  level: number;
  zoneId: number;
  subzone: string;
  x: number;
  y: number;
}
