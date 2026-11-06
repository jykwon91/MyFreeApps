import type { MobSpot } from "@/games/wow-forever/types/recipeSources";

/** A mob you can skin, in one zone it has a pack in (Classic data). */
export interface SkinnableMob {
  name: string;
  minLevel: number;
  maxLevel: number;
  /** How many spawn in this zone. */
  spawns: number;
  /** Its densest pack in this zone — Directions go here. */
  spot: MobSpot;
  /** What it skins into most. */
  leather: string;
}
