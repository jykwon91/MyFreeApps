import type { AddonNodeZone } from "@/games/wow-forever/types/professionsAddon/addonNodeZone";

/** An ore vein or herb: its colour thresholds (orange = the skill it needs) and the zones it spawns in, most first. */
export interface AddonNode {
  name: string;
  itemId: number;
  rare: boolean;
  orange: number;
  yellow: number;
  green: number;
  grey: number;
  zones: readonly AddonNodeZone[];
}
