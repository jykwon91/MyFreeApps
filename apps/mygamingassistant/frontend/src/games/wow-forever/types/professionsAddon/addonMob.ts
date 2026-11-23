import type { AddonSide } from "@/games/wow-forever/types/professionsAddon/addonSide";

/** A beast Skinning works on, in the zone where its densest pack stands. */
export interface AddonMob {
  name: string;
  minLevel: number;
  maxLevel: number;
  spawns: number;
  map: number;
  zone: string;
  side: AddonSide;
  levels: readonly [number, number] | null;
  x: number;
  y: number;
  subzone: string;
  leather: string;
}
