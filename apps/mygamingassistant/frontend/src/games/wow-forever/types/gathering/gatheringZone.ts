import type { MobSpot } from "@/games/wow-forever/types/recipeSources";

/** A zone worth gathering in now, ranked for your faction, skill and level. */
export interface GatheringZone {
  zoneId: number;
  zoneName: string;
  /** Classic spawn points of the busiest node you can gather here now. */
  count: number;
  /** The nodes worth gathering here now, lowest skill first ("Copper", "Tin"). */
  nodes: readonly string[];
  /** Where that busiest node is densest — Directions go here. */
  spot: MobSpot;
  /** The zone's level range in Forever (`zones.json`), when known. */
  levels: readonly [number, number] | null;
  /** The zone's mobs are above your level — listed after the zones that fit. */
  aboveYou: boolean;
}
