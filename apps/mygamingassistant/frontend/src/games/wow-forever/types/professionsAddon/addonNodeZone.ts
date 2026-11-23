import type { AddonSide } from "@/games/wow-forever/types/professionsAddon/addonSide";

/** A zone a node spawns in, with where its densest pack is. */
export interface AddonNodeZone {
  map: number;
  name: string;
  count: number;
  side: AddonSide;
  /** Forever's level range for the zone; null when unknown. */
  levels: readonly [number, number] | null;
  x: number;
  y: number;
  subzone: string;
}
