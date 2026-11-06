import type { SkinnableMob } from "@/games/wow-forever/types/gathering/skinnableMob";

/** A zone to skin in now: the mobs there in your band, most spawns first. */
export interface SkinningZone {
  zoneId: number;
  zoneName: string;
  /** The zone's level range in Forever (`zones.json`), when known. */
  levels: readonly [number, number] | null;
  /** Spawns of every mob in your band here. */
  spawns: number;
  mobs: readonly SkinnableMob[];
}
