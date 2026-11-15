/**
 * One place a stop can be done: a trainer, vendor, quest giver, auctioneer or
 * a mob's best spot. The World Map places NPCs by `npcId` / `poiId`; anything
 * else by `zoneId` + map percent.
 */
export interface StopOption {
  /** Unique within its stop. */
  key: string;
  name: string;
  /** "Trade District, Stormwind City": what the data calls the spot. */
  where: string;
  npcId: number | null;
  /** A World Map POI id the NPC can't be found by (a dungeon entrance). */
  poiId: string | null;
  zoneId: number | null;
  x: number;
  y: number;
}
